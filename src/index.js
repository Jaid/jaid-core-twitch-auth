/** @module jaid-core-twitch-auth */

import Router from "@koa/router"
import {Strategy as TwitchStrategy} from "@oauth-everything/passport-twitch"
import EventEmitter from "events"
import hasContent from "has-content"
import {JaidCorePlugin} from "jaid-core"
import koaBodyparser from "koa-bodyparser"
import {KoaPassport} from "koa-passport"
import {isString} from "lodash"
import twitch from "twitch"

import indexTemplate from "./auth.hbs"

/**
 * @typedef Options
 * @prop {string|string[]} scope
 * @prop {string} domain
 * @prop {string} successRedirect
 * @prop {string} failureRedirect
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
    /**
     * @type {Options}
     */
    this.options = {
      scope: [],
      successRedirect: "back",
      failureRedirect: "/",
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
        twitchClientCallbackUrl: `https://${this.options.domain}/auth/twitch/callback`,
      },
    }
  }

  async init() {
    this.apiClient = twitch.withClientCredentials(this.clientId, this.clientSecret)
  }

  handleConfig(config) {
    this.clientId = config.twitchClientId
    this.clientSecret = config.twitchClientSecret
    this.callbackUrl = config.twitchClientCallbackUrl
  }

  /**
   * @param {string} accessToken
   * @param {string} refreshToken
   * @param {import("@oauth-everything/passport-twitch").Profile} profile
   * @param {Function} done
   * @return {Promise<void>}
   */
  async verify(accessToken, refreshToken, profile, done) {
    /**
     * @type {import("./models/TwitchUser")}
     */
    const TwitchUser = this.core.database.models.TwitchUser
    let twitchUser = await TwitchUser.findByTwitchId(profile.id)
    const isNew = !twitchUser
    if (isNew) {
      const createFromLoginResult = await TwitchUser.createFromLogin(accessToken, refreshToken, profile)
      twitchUser = createFromLoginResult.twitchUser
      twitchUser.twitchToken = createFromLoginResult.twitchToken
      this.log(`Login from new Twitch user ${twitchUser.getDisplayName()}`)
    } else {
      twitchUser.twitchToken = await twitchUser.createToken(accessToken, refreshToken)
      const changes = await twitchUser.applyProfileChanges(profile)
      if (hasContent(changes)) {
        this.eventEmitter.emit("profileChanged", {
          twitchUser,
          isNew,
        })
      }
      this.log(`Login from existing Twitch user ${twitchUser.getDisplayName()}`)
    }
    this.eventEmitter.emit("login", {
      twitchUser,
      twitchToken: twitchUser.twitchToken,
      isNew,
    })
    done(null, twitchUser)
  }

  collectModels() {
    const modelsRequire = require.context("./models/", false)
    const models = {}
    for (const entry of modelsRequire.keys()) {
      const modelName = entry.match(/\.\/(?<key>\w+)/).groups.key
      models[modelName] = require(`./models/${modelName}.js`)
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
    this.passport.serializeUser((user, done) => {
      done(null, user)
    })
    this.passport.deserializeUser((user, done) => {
      done(null, user)
    })
    koa.use(this.passport.initialize())
    const router = new Router
    const indexContent = indexTemplate()
    router.get("/auth", context => {
      context.type = "html"
      context.body = indexContent
    })
    router.get("/auth/twitch", bodyparserMiddleware, this.passport.authenticate("twitch"))
    router.get("/auth/twitch/callback", bodyparserMiddleware, this.passport.authenticate("twitch", {failureRedirect: this.options.failureRedirect}), async context => {
      const twitchUser = context.state.user
      await this.core.database.models.TwitchLogin.create({
        ip: context.ip,
        userAgent: context.header["user-agent"],
        TwitchTokenId: twitchUser.twitchToken.id,
      })
      context.redirect(this.options.successRedirect)
    })
    koa.use(router.routes())
  }

}