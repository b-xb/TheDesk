import { ipcMain, Event, shell, app } from "electron"
import Mastodon, { Response, Account, OAuth } from "megalodon"
import { join } from "path"
import Datastore from "nedb"

import Client from "./Client"

interface AccountDoc {
  _id?: string
  domain: string
  acct: string
  full: string
  avatar: string
  avatarStatic: string
  accessToken: string
  color?: string
}

export default class Auth {
  public static ready() {
    ipcMain.on("new-account-setup", (event: Event, instance: string) => this.setup(event, instance))
  }

  private static async setup(event: Event, instance: string) {
    let appData: OAuth.AppData

    try {
      const SCOPES: string = "read write follow"
      appData = await Mastodon.registerApp(
        "TheDesk",
        {
          scopes: SCOPES
        },
        "https://" + instance
      )
    } catch (err) {
      let error: Error = err
      event.sender.send(`error`, {
        id: "ERROR_CONNECTION",
        message: "Connection error",
        meta: error
      })
      return
    }

    let url: string | null = appData.url
    if (url === null) {
      event.sender.send(`error`, {
        id: "ERROR_GET_AUTHURL",
        message: "Failed to get auth URL to login."
      })
      return
    }

    shell.openExternal(
      url,
      {
        activate: false
      },
      err => {
        if (err) console.log(err)
      }
    )

    ipcMain.once("new-account-auth", (event: Event, code: string, instance: string) => {
      this.auth(event, code, instance, appData.clientId, appData.clientSecret)
    })
  }

  private static async auth(event: Event, code: string, instance: string, clientId: string, clientSecret: string) {
    let tokenData: Partial<{ accessToken: string }>
    try {
      tokenData = await Mastodon.fetchAccessToken(clientId, clientSecret, code, "https://" + instance)
    } catch (err) {
      let error: Error = err
      event.sender.send(`error`, {
        id: "ERROR_CONNECTION",
        message: "Connection error",
        meta: error
      })
      return
    }

    if (tokenData.accessToken === undefined) {
      event.sender.send(`error`, {
        id: "ERROR_GET_TOKEN",
        message: "Failed to get access token."
      })
      return
    }

    const client = Client.createAuthClient('http', instance, tokenData.accessToken)

    let resp: Response<Account> = await client.get<Account>("/accounts/verify_credentials")
    let you = resp.data

    let db = new Datastore({
      filename: join(app.getPath("userData"), "account.db"),
      autoload: true
    })

    let docs: AccountDoc = {
      domain: instance,
      acct: you.acct,
      full: you.acct+"@"+instance,
      avatar: you.avatar,
      avatarStatic: you.avatar_static,
      accessToken: tokenData.accessToken,
    }

    db.insert(docs, function (err, newDocs) {
      if (err) {
        event.sender.send(`error`, {
          id: "ERROR_YOU_TRY_ANOTHER_ACCOUNT",
          message: "You cannot login already logined account."
        })
      } else {
        Client.setAuthClient('http', `@${newDocs.acct}@${newDocs.domain}`, client)
        event.sender.send(`login-complete`, newDocs)
      }
    })
  }
}
