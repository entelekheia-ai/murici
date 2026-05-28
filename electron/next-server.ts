import { spawn, ChildProcess } from "child_process"
import * as net from "net"
import * as path from "path"

let serverProcess: ChildProcess | null = null

function findFreePort(start = 3000): Promise<number> {
  return new Promise(resolve => {
    const server = net.createServer()
    server.unref()
    server.on("error", () => resolve(findFreePort(start + 1)))
    server.listen(start, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
  })
}

function waitForServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30_000
    const check = () => {
      if (Date.now() > deadline) {
        reject(new Error("Next.js server did not start within 30s"))
        return
      }
      fetch(`http://127.0.0.1:${port}/api/keys`)
        .then(() => resolve())
        .catch(() => setTimeout(check, 500))
    }
    setTimeout(check, 1000)
  })
}

export async function startNextServer(): Promise<number> {
  const port = await findFreePort(3000)
  // Standalone server.js is unpacked to resources/server/ by electron-builder
  const serverPath = path.join(process.resourcesPath, "server", "server.js")

  serverProcess = spawn("node", [serverPath], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production"
    },
    stdio: "pipe"
  })

  serverProcess.stdout?.on("data", (d: Buffer) =>
    console.log("[next]", d.toString().trim())
  )
  serverProcess.stderr?.on("data", (d: Buffer) =>
    console.error("[next]", d.toString().trim())
  )
  serverProcess.on("exit", code =>
    console.log("[next] exited with code", code)
  )

  await waitForServer(port)
  return port
}

export function stopNextServer() {
  serverProcess?.kill()
  serverProcess = null
}
