/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { Runtime } from 'aws-sdk/clients/lambda'
import { getExistingConfiguration } from '../../../../lambda/config/templates'
import { createRuntimeQuickPick, getDefaultRuntime, RuntimeFamily } from '../../../../lambda/models/samLambdaRuntime'
import { CloudFormationTemplateRegistry } from '../../../cloudformation/templateRegistry'
import { LaunchConfiguration } from '../../../debug/launchConfiguration'
import * as picker from '../../../ui/picker'
import { localize } from '../../../utilities/vsCodeUtils'
import {
    API_TARGET_TYPE,
    AwsSamDebuggerConfiguration,
    CODE_TARGET_TYPE,
    createApiAwsSamDebugConfig,
    createCodeAwsSamDebugConfig,
    createTemplateAwsSamDebugConfig,
    TEMPLATE_TARGET_TYPE,
} from '../awsSamDebugConfiguration'
import { CloudFormation } from '../../../cloudformation/cloudformation'

/**
 * Holds information required to create a launch config
 * @field resourceName: Resource being used. For templates, this is the resource name in the CFN stack. For code, this is the handler's name
 * @field rootUri: The code root. For templates, this is the CodeUri value. For code, this is the manifest's URI.
 */
export interface AddSamDebugConfigurationInput {
    resourceName: string
    rootUri: vscode.Uri
    runtimeFamily?: RuntimeFamily
}

/**
 * Adds a new debug configuration for the given sam function resource and template.
 */
export async function addSamDebugConfiguration(
    { resourceName, rootUri, runtimeFamily }: AddSamDebugConfigurationInput,
    type: typeof CODE_TARGET_TYPE | typeof TEMPLATE_TARGET_TYPE | typeof API_TARGET_TYPE
): Promise<void> {
    // tslint:disable-next-line: no-floating-promises
    emitCommandTelemetry()

    let samDebugConfig: AwsSamDebuggerConfiguration
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(rootUri)
    const runtimeName = runtimeFamily ? getDefaultRuntime(runtimeFamily) : undefined

    if (type === TEMPLATE_TARGET_TYPE) {
        let preloadedConfig = undefined

        if (workspaceFolder) {
            const registry = CloudFormationTemplateRegistry.getRegistry()
            const templateDatum = registry.getRegisteredTemplate(rootUri.fsPath)
            if (templateDatum) {
                const resource = templateDatum.template.Resources![resourceName]
                if (resource && resource.Properties) {
                    const handler = CloudFormation.getStringForProperty(
                        resource.Properties.Handler,
                        templateDatum.template
                    )
                    const existingConfig = await getExistingConfiguration(workspaceFolder, handler ?? '', rootUri)
                    if (existingConfig) {
                        const responseMigrate: string = localize(
                            'AWS.sam.debugger.useExistingConfig.migrate',
                            'Create based on the legacy config'
                        )
                        const responseNew: string = localize(
                            'AWS.sam.debugger.useExistingConfig.doNotMigrate',
                            'Create new config only'
                        )
                        const prompt = await vscode.window.showInformationMessage(
                            localize(
                                'AWS.sam.debugger.useExistingConfig',
                                'AWS Toolkit detected an existing legacy configuration for this function. Create the debug config based on the legacy config?'
                            ),
                            { modal: true },
                            responseMigrate,
                            responseNew
                        )
                        if (!prompt) {
                            // User selected "Cancel". Abandon config creation
                            return
                        } else if (prompt === responseMigrate) {
                            preloadedConfig = existingConfig
                        }
                    }
                }
            }
        }
        samDebugConfig = createTemplateAwsSamDebugConfig(
            workspaceFolder,
            runtimeName,
            resourceName,
            rootUri.fsPath,
            preloadedConfig
        )
    } else if (type === CODE_TARGET_TYPE) {
        const quickPick = createRuntimeQuickPick({
            runtimeFamily,
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })
        const val = picker.verifySinglePickerOutput(choices)

        if (val) {
            // strip the manifest's URI to the manifest's dir here. More reliable to do this here than converting back and forth between URI/string up the chain.
            samDebugConfig = createCodeAwsSamDebugConfig(
                workspaceFolder,
                resourceName,
                path.dirname(rootUri.fsPath),
                val.label as Runtime
            )
        } else {
            // User backed out of runtime selection. Abandon config creation.
            return
        }
    } else if (type === API_TARGET_TYPE) {
        samDebugConfig = createApiAwsSamDebugConfig(workspaceFolder, runtimeName, resourceName, rootUri.fsPath)
    } else {
        throw new Error('Unrecognized debug target type')
    }

    const launchConfig = new LaunchConfiguration(rootUri)
    await launchConfig.addDebugConfiguration(samDebugConfig)

    await openLaunchJsonFile()
}

export async function openLaunchJsonFile(): Promise<void> {
    vscode.commands.executeCommand('workbench.action.debug.configure')
}

async function emitCommandTelemetry(): Promise<void> {
    // TODO add new metric for when command is executed
}
