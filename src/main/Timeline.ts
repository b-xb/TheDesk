import {
    ipcMain,
    Event
} from 'electron'
import { Status, Response } from 'megalodon'

import Client from './Client'
import Window from './Window'

export default class Timeline {
    public static ready() {
        ipcMain.on('no-auth-timeline', async (event: Event, name: string) => {
            const client = Client.getNoAuthClient(name)
            let res: Response<[Status]> = await client.get<[Status]>('/timelines/public?local=true')
            event.returnValue = res.data
        })
    }
}