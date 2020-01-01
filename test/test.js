import path from "path"

import fsp from "@absolunet/fsp"
import delay from "delay"
import getPort from "get-port"
import JaidCore from "jaid-core"
import ms from "ms.macro"

const indexModule = (process.env.MAIN ? path.resolve(process.env.MAIN) : path.join(__dirname, "..", "src")) |> require

/**
 * @type { import("../src") }
 */
const {default: Plugin} = indexModule

it("should run", async () => {
  let authHomepageResponse
  const insecurePort = await getPort()
  const twitchAuthPlugin = new Plugin()
  const core = new JaidCore({
    insecurePort,
    name: _PKG_TITLE,
    folder: ["Jaid", _PKG_TITLE, "test", new Date().toISOString()],
    version: _PKG_VERSION,
    useGot: true,
    sqlite: true,
  })
  const secretsFile = path.join(core.appFolder, "secrets.yml")
  await fsp.writeYaml(secretsFile, {
  })
  const testClientClass = class {

    init() {
      /**
       * @type {import("got").Got}
       */
      this.got = core.got.extend({
        prefixUrl: "http://localhost",
        port: insecurePort,
      })
    }

    async ready() {
      core.logger.info(`Link: http://localhost:${insecurePort}/auth`)
      authHomepageResponse = await this.got("auth")
    }

  }
  await core.init({
    dashboard: twitchAuthPlugin,
    test: testClientClass,
  })
  await delay(ms`30 seconds`)
  expect(authHomepageResponse.statusCode).toBe(200)
  await core.close()
}, ms`40 seconds`)