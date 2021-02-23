import { Server as SSHServer } from 'ssh2';
import { createServer, Server as HttpServer, get } from 'http';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import path from 'path';
import { AddressInfo, Socket } from 'net';

import SSHTunnel, { SshTunnelConfig } from './index';

function request(url: string) {
  return new Promise((resolve, reject) => {
    const req = get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data.trim());
      });
    });
    req.on('error', (e) => {
      reject(e);
    });
  });
}

function createTestHttpServer(): Promise<HttpServer> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.end('Hello from http server\n');
    });
    server.listen(0, 'localhost', () => {
      resolve(server);
    });
  });
}

function createTestSshServer(): Promise<SSHServer> {
  return new Promise((resolve) => {
    const key = path.resolve(__dirname, '..', '__fixtures__', 'rsa');
    const server = new SSHServer(
      {
        hostKeys: [readFileSync(key)],
      },
      (client) => {
        client
          .on('authentication', (ctx) => {
            ctx.accept();
          })
          .on('ready', () => {
            client.on('tcpip', (accept, _reject, { destPort, destIP }) => {
              const channel = accept();
              const connection = new Socket();
              channel.pipe(connection).pipe(channel);
              connection.connect(destPort, destIP);
            });
          });
      }
    );
    server.listen(0, 'localhost', () => {
      resolve(server);
    });
  });
}

async function createTestSshTunnel(config: Partial<SshTunnelConfig>) {
  const tunnel = new SSHTunnel(config);
  await tunnel.listen();
  return tunnel;
}

describe('SSHTunnel', () => {
  let sshServer: SSHServer, httpServer: HttpServer, sshTunnel: SSHTunnel;

  beforeAll(async () => {
    sshServer = await createTestSshServer();
    httpServer = await createTestHttpServer();
    sshTunnel = await createTestSshTunnel({
      username: 'user',
      port: sshServer.address().port,
      dstPort: (httpServer.address() as AddressInfo).port,
      localPort: 0,
    });
  });

  afterAll(async () => {
    await sshTunnel.close();
    await promisify(httpServer.close.bind(httpServer))();
    await promisify(sshServer.close.bind(sshServer))();
  });

  it('should be main export', () => {
    expect(new SSHTunnel()).toBeInstanceOf(SSHTunnel);
  });

  it('creates a tunnel that allows to request remote server through an ssh server', async () => {
    const { localAddr, localPort } = sshTunnel.config;
    const reqPath = `http://${localAddr}:${localPort}`;
    const res = await request(reqPath);
    expect(res).toBe('Hello from http server');
  });
});
