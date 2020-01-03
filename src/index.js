/** @module jaid-core-twitch-auth */

import Router from "@koa/router"
import EventEmitter from "events"
import {JaidCorePlugin} from "jaid-core"
import koaBodyparser from "koa-bodyparser"
import {KoaPassport} from "koa-passport"
import {isString} from "lodash"
import {Strategy as TwitchStrategy} from "passport-twitch-new"

import TwitchLogin from "src/models/TwitchLogin"
import TwitchProfileChange from "src/models/TwitchProfileChange"
import TwitchUser from "src/models/TwitchUser"

import indexTemplate from "./auth.hbs"

/**
 * @typedef Options
 * @prop {string|string[]} scope
 * @prop {string} domain
 */

export default class TwitchAuthPlugin extends JaidCorePlugin {

  /**
   * @type {string}
   */
  clientId = null

  /**
   * @type {string}
   */
  clientSecret = null

  /**
   * @type {string}
   */
  callbackUrl = null

  /**
   * @type {EventEmitter}
   */
  eventEmitter = new EventEmitter

  /**
   * @constructor
   * @param {Options} options
   */
  constructor(options = {}) {
    super()
    this.options = {
      scope: [],
      domain: null,
      ...options,
    }
    if (isString(this.options.scope)) {
      this.options.scope = [this.options.scope]
    }
  }

  /**
   * @return {import("essential-config").Options}
   */
  getConfigSetup = () => {
    return {
      secretKeys: ["twitchClientSecret"],
      defaults: {
        twitchClientId: "ENTER",
        twitchClientCallbackUrl: this.options.domain ? `https://${this.options.domain}/auth/twitch/callback` : "ENTER",
      },
    }
  }

  setCoreReference(core) {
    /**
     * @type {import("jaid-core").default}
     */
    this.core = core
  }

  handleConfig(config) {
    this.clientId = config.twitchClientId
    this.clientSecret = config.twitchClientSecret
    this.callbackUrl = config.twitchClientCallbackUrl
  }

  /**
   * @param {string} accessToken
   * @param {string} refreshToken
   * @param {Object} profile
   * @param {Function} done
   * @return {Promise<void>}
   */
  async verify(accessToken, refreshToken, profile, done) {
    let twitchUser = await TwitchUser.findByTwitchId(profile.id)
    const isNew = !twitchUser
    if (isNew) {
      this.log(`Login from new Twitch user ${profile.login}`)
      const createTwitchUserResult = await TwitchUser.createFromLogin(accessToken, refreshToken, profile)
      twitchUser = createTwitchUserResult.twitchUser
      await twitchUser.save()
    } else {
      this.log(`Login from existing Twitch user ${profile.login}`)
      await twitchUser.update({
        accessToken,
        refreshToken,
      })
    }
    this.eventEmitter.emit("login", {
      twitchUser,
      isNew,
    })
    done()
  }

  collectModels() {
    const modelsRequire = require.context("./models/", false)
    const models = {}
    for (const entry of modelsRequire.keys()) {
      const modelName = entry.match(/\.\/(?<key>[\da-z]+)/i).groups.key
      const model = require(`./models/${modelName}.js`)
      model.default.plugin = this
      models[modelName] = model
    }
    return models
  }

  /**
   * @param {import("koa")} koa
   */
  handleKoa(koa) {
    const bodyparserMiddleware = koaBodyparser()
    this.passport = new KoaPassport
    const strategy = new TwitchStrategy({
      scope: this.options.scope,
      clientID: this.clientId,
      clientSecret: this.clientSecret,
      callbackURL: this.callbackUrl,
    }, this.verify.bind(this))
    this.passport.use(strategy)
    this.router = new Router
    this.router.get("/auth", bodyparserMiddleware, context => {
      context.type = "html"
      context.body = indexTemplate()
    })
    this.router.get("/auth/twitch", bodyparserMiddleware, this.passport.authenticate("twitch"))
    this.router.get("/auth/twitch/callback", bodyparserMiddleware, this.passport.authenticate("twitch", {failureRedirect: "/"}), context => {
      context.body = "OK"
    })
    koa.use(this.router.routes())
  }

}