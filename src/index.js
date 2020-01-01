/** @module jaid-core-twitch-auth */

import Router from "@koa/router"
import {KoaPassport} from "koa-passport"
import {Strategy as TwitchStrategy} from "passport-twitch-new"
import {isString} from "lodash"
import koaBodyparser from "koa-bodyparser"
import TwitchUser from "src/models/TwitchUser"

import indexTemplate from "./auth.hbs"

/**
 * @typedef Options
 * @prop {string|string[]} scope
 * @prop {string} domain
 */

export default class TwitchAuthPlugin {

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
   * @constructor
   * @param {Options} options
   */
  constructor(options = {}) {
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
    await TwitchUser.upsert({
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
    console.log("Login from Twitch user %s", profile.login)
    done()
  }

  // collectModels() {
  //   return {
  //     TwitchUser,
  //   }
  // }

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