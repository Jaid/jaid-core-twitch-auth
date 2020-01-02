/** @module jaid-core-twitch-auth */

import Router from "@koa/router"
import EventEmitter from "events"
import {JaidCorePlugin} from "jaid-core"
import koaBodyparser from "koa-bodyparser"
import {KoaPassport} from "koa-passport"
import {isString} from "lodash"
import {Strategy as TwitchStrategy} from "passport-twitch-new"

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
   */
  async verify(accessToken, refreshToken, profile, done) {
    let twitchUser = await TwitchUser.findByTwitchId(profile.id)
    let isNew
    if (twitchUser) {
      this.log(`Login from existing Twitch user ${profile.login}`)
      isNew = false
      await twitchUser.update({
        accessToken,
        refreshToken,
      })
    } else {
      this.log(`Login from new Twitch user ${profile.login}`)
      isNew = true
      twitchUser = TwitchUser.build({
        accessToken,
        refreshToken,
        broadcasterType: profile.broadcaster_type,
        description: profile.description,
        displayName: profile.display_name,
        twitchId: profile.id,
        loginName: profile.login,
        offlineImageUrl: profile.offline_image_url,
        avatarUrl: profile.profile_image_url,
        viewCount: profile.view_count,
      })
      await twitchUser.save()
    }
    this.eventEmitter.emit("login", {
      twitchUser,
      isNew,
    })
    done()
  }

  collectModels() {
    return {
      TwitchUser: require("src/models/TwitchUser"),
    }
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