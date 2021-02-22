import { promisify } from 'util';
import { EventEmitter, once } from 'events';
import { createServer, Server, Socket } from 'net';
import { Client, ConnectConfig } from 'ssh2';

type ForwardOutConfig = {
  srcHost: string;
  srcPort: number;
  dstHost: string;
  dstPort: number;
};

type LocalProxyServerConfig = {
  localHost: string;
  localPort: number;
};

export type SshTunnelConfig = ConnectConfig &
  ForwardOutConfig &
  LocalProxyServerConfig;

function getConnectConfig(config: Partial<SshTunnelConfig>): ConnectConfig {
  const {
    srcHost,
    srcPort,
    dstHost,
    dstPort,
    localHost,
    localPort,
    ...connectConfig
  } = config;

  return connectConfig;
}

function getSshTunnelConfig(config: Partial<SshTunnelConfig>): SshTunnelConfig {
  const connectConfig = { port: 22, ...getConnectConfig(config) };

  return Object.assign(
    {},
    {
      srcPort: 0,
      srcHost: '127.0.0.1',
      dstHost: '127.0.0.1',
      dstPort: connectConfig.port,
    },
    {
      localHost: '127.0.0.1',
      localPort: connectConfig.port,
    },
    config
  );
}

class SshTunnel extends EventEmitter {
  private connections: Set<Socket> = new Set();

  private server: Server;

  private rawConfig: SshTunnelConfig;

  constructor(config: Partial<SshTunnelConfig> = {}) {
    super();

    this.rawConfig = getSshTunnelConfig(config);

    this.server = createServer((socket) => {
      const sshClient = new Client();
      const forwardOut = promisify(sshClient.forwardOut.bind(sshClient));

      this.connections.add(socket);

      sshClient.on('ready', async () => {
        const { srcHost, srcPort, dstHost, dstPort } = this.rawConfig;

        try {
          const channel = await forwardOut(srcHost, srcPort, dstHost, dstPort);
          socket.pipe(channel).pipe(socket);
        } catch (err) {
          err.origin = 'ssh-client';
          socket.destroy(err);
        }
      });

      sshClient.on('error', (err) => {
        (err as any).origin = 'ssh-client';
        socket.destroy(err);
      });

      socket.on('error', (err) => {
        (err as any).origin = (err as any).origin ?? 'connection';
        this.server.emit('error', err);
      });

      socket.once('close', () => {
        sshClient.end();
      });

      socket.once('close', () => {
        this.connections.delete(socket);
      });

      try {
        sshClient.connect(getConnectConfig(this.rawConfig));
      } catch (err) {
        err.origin = 'ssh-client';
        socket.destroy(err);
      }
    });

    (['close', 'connection', 'error', 'listening'] as const).forEach(
      (eventName) => {
        this.server.on(eventName, this.emit.bind(this, eventName));
      }
    );
  }

  get config(): SshTunnelConfig {
    const serverAddress = this.server.address();

    return {
      ...this.rawConfig,
      localPort:
        (typeof serverAddress !== 'string' && serverAddress?.port) ||
        this.rawConfig.localPort,
    };
  }

  async listen(): Promise<void> {
    const serverListen: (
      port?: number,
      host?: string
    ) => Promise<void> = promisify(this.server.listen.bind(this.server));
    const { localPort, localHost } = this.rawConfig;
    await serverListen(localPort, localHost);
  }

  async close(): Promise<void> {
    const serverClose = promisify(this.server.close.bind(this.server));

    try {
      await serverClose();
    } finally {
      await this.closeOpenConnections();
    }
  }

  private async closeOpenConnections() {
    const waitForClose: Promise<unknown[]>[] = [];
    this.connections.forEach((socket) => {
      waitForClose.push(once(socket, 'close'));
      socket.destroy();
    });
    await Promise.all(waitForClose);
    this.connections.clear();
  }
}

export default SshTunnel;
