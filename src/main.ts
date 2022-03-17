/*
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    exportVariable,
    getBooleanInput,
    getInput,
    info as logInfo,
    setFailed,
    warning as logWarning,
} from '@actions/core';
import {
    Credential,
    errorMessage,
    isServiceAccountKey,
    parseCredential,
    randomFilepath,
    writeSecureFile,
} from '@google-github-actions/actions-utils';

import { ClusterClient } from './gkeClient';

async function run(): Promise<void> {
    try {
        // Get inputs
        // let projectID = getInput('project_id');
        // let location = getInput('location');
        // let clusterID = "engineering-vizix-cloud";
        // let clusterName = "eng-vizix-cloud";
        // let clusterlocation = "us-central1-a";
        let clusterID = <string>process.env.CLUSTER_ID;
        let clusterName = process.env.CLUSTER_NAME;
        let clusterlocation = process.env.CLUSTER_LOCATION;

        const useAuthProvider = true;
        const useInternalIP = false;
        // let contextName = getInput('context_name');

        // Add warning if using credentials
        let credentialsJSON: Credential | undefined;
        // if (credentials) {
        //     logWarning(
        //         'The "credentials" input is deprecated. ' +
        //         'Please switch to using google-github-actions/auth which supports both Workload Identity Federation and JSON Key authentication. ' +
        //         'For more details, see https://github.com/google-github-actions/get-gke-credentials#authorization',
        //     );

        //     credentialsJSON = parseCredential(credentials);
        // }

        // Pick the best project ID.
        
        let projectID = clusterName;
        if (clusterName) {
            logInfo(`Extracted projectID "${projectID}" from cluster resource name`);
        } else if (credentialsJSON && isServiceAccountKey(credentialsJSON)) {
            projectID = credentialsJSON?.project_id;
            logInfo(`Extracted project ID "${projectID}" from credentials JSON`);
        } else if (process.env?.GCLOUD_PROJECT) {
            projectID = process.env.GCLOUD_PROJECT;
            logInfo(`Extracted project ID "${projectID}" from $GCLOUD_PROJECT`);
        } else {
            throw new Error(
                `Failed to extract project ID, please set the "project_id" input, ` +
                `set $GCLOUD_PROJECT, or specify the cluster name as a full ` +
                `resource name.`,
            );
        
        }

        // Pick the best location.
        if (clusterlocation) {

            logInfo(`Extracted location "${clusterlocation}" from cluster resource name`);
        } else {
            throw new Error(
                `Failed to extract location, please set the "location" input or ` +
                `specify the cluster name as a full resource name.`,
            );
        }

        // Pick the best context name.
        // if (!contextName) {
        let contextName = `gke_${projectID}_${clusterlocation}_${clusterID}`;
        // }

        // Create Container Cluster client
        const client = new ClusterClient({
            projectID: projectID,
            location: clusterlocation,
            credentials: credentialsJSON,
        });

        // Get Cluster object
        const clusterData = await client.getCluster(clusterID);

        // Create KubeConfig
        const kubeConfig = await client.createKubeConfig({
            useAuthProvider: useAuthProvider,
            useInternalIP: useInternalIP,
            clusterData: clusterData,
            contextName: contextName,
        });

        // Write kubeconfig to disk
        try {
            const workspace = process.env.GITHUB_WORKSPACE;
            if (!workspace) {
                throw new Error('Missing $GITHUB_WORKSPACE!');
            }

            const kubeConfigPath = await writeSecureFile(randomFilepath(workspace), kubeConfig);
            exportVariable('KUBECONFIG', kubeConfigPath);
            logInfo(`Successfully created and exported "KUBECONFIG" at ${kubeConfigPath}`);
        } catch (err) {
            const msg = errorMessage(err);
            throw new Error(`Failed to write Kubernetes config file: ${msg}`);
        }
    } catch (err) {
        const msg = errorMessage(err);
        setFailed(`google-github-actions/get-gke-credentials failed with: ${msg}`);
    }
}

run();