import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime-types';
import Redis from 'ioredis';
import { stringify } from 'querystring';

const publisher = new Redis('');

const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: '',
        secretAccessKey: ''
    }
});

const PROJECT_ID = process.env.PROJECT_ID;

function publishLog(log) {
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({log}))
}

function getDirname(importMetaUrl) {
    const __filename = new URL(importMetaUrl).pathname;
    return path.dirname(__filename);
}

async function uploadFile(filePath, s3Key) {
    const command = new PutObjectCommand({
        Bucket: 'vercel-clone-deployments',
        Key: s3Key,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath)
    });
    await s3Client.send(command);
    console.log('Uploaded', s3Key);
}

async function uploadDirectory(directoryPath, s3KeyPrefix) {
    const contents = fs.readdirSync(directoryPath, { withFileTypes: true });

    for (const dirent of contents) {
        const filePath = path.join(directoryPath, dirent.name);
        const s3Key = `${s3KeyPrefix}/${dirent.name}`;

        if (dirent.isDirectory()) {
            await uploadDirectory(filePath, s3Key); 
        } else {
            await uploadFile(filePath, s3Key);
        }
    }
}

async function init() {
    console.log('Executing script.mjs');
    publishLog(`Executing script.mjs`);
    const __dirname = getDirname(import.meta.url);
    const outDirPath = path.join(__dirname, 'output');

    const p = exec(`cd ${outDirPath} && npm install && npm run build`);

    p.stdout.on('data', function (data) {
        console.log(data.toString());
        publishLog(data.toString())
    });

    p.stderr.on('data', function (data) {
        console.log('Error', data.toString());
        publishLog(`Error: ${data.toString()}`);
    });

    p.on('close', async function () {
        console.log('Build Complete')
        publishLog(`Build Complete`);
        const distFolderPath = path.join(__dirname, 'output', 'dist')
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true })
        publishLog(`Starting Upload`);
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file)
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log('uploading', filePath);
            publishLog(`uploading: ${filePath}`);
            const command = new PutObjectCommand({
                Bucket: 'vercel-clone-deployments',
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })
            
            
            await uploadDirectory(distFolderPath, `__outputs/${PROJECT_ID}`);
            await s3Client.send(command)
            console.log('uploaded', filePath);
            publishLog(`uploaded: ${filePath}`);
        }
        console.log('Done');
        publishLog(`Done`);
    })
}

init();
