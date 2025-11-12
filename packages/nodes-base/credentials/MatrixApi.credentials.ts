import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class MatrixApi implements ICredentialType {
	name = 'matrixApi';

	displayName = 'Matrix API';

	documentationUrl = 'matrix';

	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'Homeserver URL',
			name: 'homeserverUrl',
			type: 'string',
			default: 'https://matrix-client.matrix.org',
		},
		{
			displayName: 'User ID',
			name: 'userId',
			type: 'string',
			default: '',
			placeholder: '@user:matrix.org',
			description: 'Your Matrix user ID (optional, used for encryption)',
		},
		{
			displayName: 'Device ID',
			name: 'deviceId',
			type: 'string',
			default: '',
			placeholder: 'N8N_DEVICE',
			description: 'Device ID for this n8n instance (optional, used for encryption)',
		},
		{
			displayName: 'Enable Encryption',
			name: 'enableEncryption',
			type: 'boolean',
			default: false,
			description:
				'Whether to enable end-to-end encryption support for encrypted rooms. Requires userId and deviceId.',
		},
	];
}
