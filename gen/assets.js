import path from 'path';
import fs from 'fs';

let excluded_source_files = ['src/routes/xp/starting.svelte'];

function walk(dirPath) {
    return fs
        .readdirSync(dirPath, { recursive: true })
        .map((entry) => path.join(dirPath, String(entry)))
        .filter((entry) => fs.statSync(entry).isFile());
}

let source_files = [
    ...walk('./src/'),
    'static/json/hard_drive.json',
    'svelte.config.js',
    'tailwind.config.cjs',
    'vite.config.js'
]
    .filter((el) => ['.js', '.json', '.svelte', '.css', '.cjs', '.html'].includes(path.extname(el)))
    .map((el) => el.replace(/\\/g, '/'))
    .filter((el) => !excluded_source_files.includes(el));

let images = walk('./static/images/')
    .filter((file) => ['.png', '.jpg', '.svg', '.gif'].includes(path.extname(file)))
    .filter((file) => included(file))
    .map((file) => '/' + path.relative('static', file).replace(/\\/g, '/'));

let fonts = walk('./static/fonts/')
    .filter((file) => ['.ttf'].includes(path.extname(file)))
    .filter((file) => included(file))
    .map((file) => '/' + path.relative('static', file).replace(/\\/g, '/'));

let audios = walk('./static/audio/')
    .filter((file) => ['.mp3', '.wav'].includes(path.extname(file)))
    .filter((file) => included(file))
    .map((file) => '/' + path.relative('static', file).replace(/\\/g, '/'));

let empties = walk('./static/empty/')
    .filter((file) => included(file))
    .map((file) => '/' + path.relative('static', file).replace(/\\/g, '/'));

let assets = { images, audios, fonts, empties };
for (let key of Object.keys(assets)) {
    console.log('let ' + key + ' = ' + JSON.stringify(assets[key]) + ';\n');
}

function included(asset) {
    let basename = path.basename(asset);
    for (let file of source_files) {
        let content = fs.readFileSync(file, 'utf-8');
        if (content.includes(basename)) return true;
    }
    return false;
}
