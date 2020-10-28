/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Socket } from 'net'
import { getLogger, Logger } from '../logger'

const DEBUG_ADAPTER_RESPONSE_TIMEOUT_MILLIS = 1500

export class PythonDebugAdapterHeartbeat {
    private readonly socket: Socket
    private readonly logger: Logger = getLogger()
    public constructor(private readonly port: number) {
        this.socket = new Socket()
    }

    public async connect(): Promise<boolean> {
        this.logger.verbose(`Attempting to connect to port ${this.port}`)

        return new Promise<boolean>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.logger.verbose(`Timeout before connecting to port ${this.port}`)
                // We never got a response
                resolve(false)
            }, DEBUG_ADAPTER_RESPONSE_TIMEOUT_MILLIS)

            this.socket.once('connect', () => {
                clearTimeout(timeout)
                this.logger.verbose('Made connection')
                resolve(true)
            })
            this.socket.once('error', (err: Error) => {
                clearTimeout(timeout)
                this.logger.verbose('Error while connecting: %O', err)
                resolve(false)
            })

            this.socket.connect(this.port)
        })
    }

    public async isDebugServerUp(): Promise<boolean> {
        this.logger.verbose('Checking if Debug Adapter responds')

        return new Promise<boolean>((resolve, reject) => {
            const timeout = setTimeout(() => {
                // We never got a response yet/at all
                this.logger.verbose('Timeout waiting for response from Debug Adapter')
                resolve(false)
            }, DEBUG_ADAPTER_RESPONSE_TIMEOUT_MILLIS)

            this.socket.on('data', data => {
                clearTimeout(timeout)
                this.logger.verbose('Data received from Debug Adapter: %s', data.toString())
                // we don't send a message; we assume that we always receive a telemetry event from the debugger
                resolve(true)
            })

            this.socket.once('error', (err: Error) => {
                clearTimeout(timeout)
                this.logger.verbose('Error writing to Debug Adapter: %O', err)
                resolve(false)
            })
        })
    }

    public async disconnect(): Promise<void> {
        this.logger.verbose('Destroying socket')
        this.socket.destroy()
    }
}
