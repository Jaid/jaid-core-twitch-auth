import fsp from "@absolunet/fsp"
import delay from "delay"
import JaidCore from "jaid-core"
import ms from "ms.macro"
import open from "open"
import path from "path"

const indexModule = (process.env.MAIN ? path.resolve(process.env.MAIN) : path.join(__dirname, "..", "src")) |> require

/**
 * @type { import("../src") }
 */
const {default: Plugin} = indexModule

it("should run", async () => {
  let authHomepageResponse
  const insecurePort = 51402
  const twitchAuthPlugin = new Plugin({
    failureRedirect: "/failure",
  })
  const core = new JaidCore({
    insecurePort,
    name: _PKG_TITLE,
    folder: ["Jaid", _PKG_TITLE, "test", new Date().toISOString()],
    version: _PKG_VERSION,
    useGot: true,
    sqlite: true,
  })
  const configFile = path.join(core.appFolder, "config.yml")
  await fsp.writeYaml(configFile, {
    twitchClientId: process.env.jaidCoreTwitchAuthClientId,
    twitchClientCallbackUrl: `http://localhost:${insecurePort}/auth/twitch/callback`,
  })
  const secretsFile = path.join(core.appFolder, "secrets.yml")
  await fsp.writeYaml(secretsFile, {
    twitchClientSecret: process.env.jaidCoreTwitchAuthClientSecret,
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
    twitchAuth: twitchAuthPlugin,
    test: testClientClass,
  })
  await delay(ms`3 seconds`)
  expect(authHomepageResponse.statusCode).toBe(200)
  if (process.env.GITHUB_WORKFLOW) {
    // If in CI, there is no chance to log in, so stop testing here
    await core.close()
    return
  }
  const loginInChrome = async () => {
    await open(`http://localhost:${insecurePort}/auth/twitch`)
    await delay(ms`10 seconds`)
  }
  let loginCalled = false
  twitchAuthPlugin.eventEmitter.once("login", ({twitchUser, isNew}) => {
    expect(isNew).toBeTruthy()
    expect(twitchUser.displayName).toBe("Jaidchen")
    loginCalled = true
  })
  await loginInChrome()
  const [twitchUsers, twitchTokens, twitchLogins] = await Promise.all([
    core.database.models.TwitchUser.findAll(),
    core.database.models.TwitchToken.findAll(),
    core.database.models.TwitchLogin.findAll(),
  ])
  expect(twitchUsers.length).toBe(1)
  expect(twitchTokens.length).toBe(1)
  expect(twitchLogins).toMatchObject([
    {
      id: 1,
      ip: "::1",
    },
  ])
  const twitchUser = twitchUsers[0]
  /**
   * @type {import("twitch").default}
   */
  const apiClient = await twitchUser.toTwitchClient()
  const profile = await apiClient.helix.users.getUserByName("jaidchen")
  expect(profile.displayName).toBe("Jaidchen")
  await loginInChrome()
  const helixUser = await apiClient.helix.users.getUserByName("jaidchen")
  // eslint-disable-next-line no-underscore-dangle
  helixUser._data.view_count = 3
  const fetchedTwitchUser = await core.database.models.TwitchUser.findOrRegister({
    key: "loginName",
    value: "jaidchen",
    helixUser,
  })
  expect(fetchedTwitchUser.getDisplayName()).toBe("Jaidchen")
  const newTwitchUser = await core.database.models.TwitchUser.findOrRegisterByLogin("neydora")
  expect(newTwitchUser.getDisplayName()).toBe("Neydora")
  await core.close()
  expect(loginCalled).toBeTruthy()
}, ms`60 seconds`)