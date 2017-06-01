const GitHub = require('github');
const Promise = require('bluebird');
const request = require('request');
const fs = require('fs');

const github = new GitHub();
console.log(process.argv[2]);

github.authenticate({
    type: 'oauth',
    token: process.argv[2],
});

const origReleasePromise = github.repos.getReleaseByTag({
    owner: 'sass',
    repo: 'node-sass',
    tag: 'v3.4.2',
});

const bcReleasePromise = github.repos.getReleaseByTag({
    owner: 'bigcommerce-labs',
    repo: 'node-sass',
    tag: 'v3.4.4',
});

Promise.all([origReleasePromise, bcReleasePromise]).then(a => {
    const sassBindings = a[0].data.assets;
    const bcRelease = a[1].data;

    console.log('bc bindings:');
    bcRelease.assets.forEach(b => console.log(b.id, b.name));

    const missingBindings = [];
    sassBindings.forEach(binding => {
        if (!bindingExist(bcRelease, binding)) {
            missingBindings.push(binding);
        }
    });

    console.log('\nmissing bindings:');
    missingBindings.forEach(b => console.log(b.name));

    Promise.mapSeries(missingBindings, binding => processBinding(bcRelease, binding))
        .then(() => {
            console.log('done');
        })
        .catch(() => {
            console.log('what?');
        });
});

function processBinding(bcRelease, binding) {
    console.log(`\nProcessing: ${binding.name}`);
    return dowloadBindings(binding)
        .then(filePath => upload(bcRelease, binding, filePath))
        .catch((e) => {
            console.log(e);
        });
}

function bindingExist(bcRelease, binding) {
    return !!bcRelease.assets.find(bcb => bcb.name === binding.name);
}

function dowloadBindings(binding) {
    const dest = binding.name;

    return new Promise((resolve, reject) => {
        console.log(`Downloading ${binding.browser_download_url}`);

        const req = request(binding.browser_download_url);

        req.on('response',  function (res) {
            const writeStream = fs.createWriteStream(dest);
            res.pipe(writeStream);

            res.on('error', reject);

            res.on('end', () => {
                resolve(dest);
            });
        });
    });
}

function upload(bcRelease, binding, filePath) {
    console.log(filePath);
    const uploadParams = {
        id: bcRelease.id,
        owner: 'bigcommerce-labs',
        repo: 'node-sass',
        filePath,
        name: binding.name,
    };

    console.log('Uploading Binding File...');

    return github.repos.uploadAsset(uploadParams)
        .then(asset => {
            console.log(`Upload complete: ${asset.data.browser_download_url}`);
            return asset;
        });
}
