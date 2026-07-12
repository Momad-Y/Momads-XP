import path from 'path';
import fs from 'fs';

let files = fs
    .readdirSync('./src/routes/', { recursive: true })
    .map((entry) => path.join('./src/routes/', String(entry)))
    .filter(
        (entry) =>
            fs.statSync(entry).isFile() && path.extname(entry) === '.svelte',
    );

let statements = '';
for (let file of files) {
    let import_path =
        './' + path.relative('./src/routes/', file).replace(/\\/g, '/');
    statements =
        statements +
        `
        else if(url == '${import_path}'){
            page = (await import('${import_path}')).default;

        }`;
}
console.log(statements);
