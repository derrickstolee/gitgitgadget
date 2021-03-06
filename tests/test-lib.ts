import * as fs from "fs";
import * as util from "util";
import { isDirectory, isFile } from "../lib/fs-util";
import { git, IGitOptions, revParse } from "../lib/git";

const mkdir = util.promisify(fs.mkdir);
const readdir = util.promisify(fs.readdir);
const realpath = util.promisify(fs.realpath);
const rmdir = util.promisify(fs.rmdir);
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);

export async function removeRecursively(path: string): Promise<void> {
    if (!await isDirectory(path)) {
        await unlink(path);
    } else {
        const items = await readdir(path);
        for (const name of items) {
            await removeRecursively(`${path}/${name}`);
        }
        await rmdir(path);
    }
}

export async function testCreateRepo(name: string, suffix?: string):
    Promise<string> {
    let tmp = `${__dirname}/../.test-dir/`;
    if (!await isDirectory(tmp)) {
        await mkdir(tmp);
    }
    tmp = await realpath(tmp);

    const match = name.match(/^(.*[\\/])?(.*?)(\.test)?\.ts$/);
    if (match) {
        name = `trash directory.${match[2]}`;
    }
    if (suffix) {
        name += suffix;
    }

    const dir = `${tmp}/${name}`;
    if (await isDirectory(dir)) {
        await removeRecursively(dir);
        if (await isDirectory(dir)) {
            throw new Error(`rm -rf ${dir} failed!`);
        }
    }

    await git(["init", dir]);

    process.env.HOME = tmp;
    if (!await isFile(`${tmp}/.gitconfig`)) {
        await git(["config", "--global", "user.name", "Test User"]);
        await git(["config", "--global", "user.email", "user@example.com"]);
    }
    await git([
        "commit-tree", "-m", "Test commit",
        "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    ], {
            env: {
                GIT_AUTHOR_DATE: `123457689 +0000`,
                GIT_COMMITTER_DATE: `123457689 +0000`,
            },
            workDir: dir,
        },
    );

    return dir;
}

let testTickEpoch = 1234567890;

function testTick(): number {
    return testTickEpoch += 60;
}

export interface ITestCommitOptions {
    workDir: string;
    author?: string;
    committer?: string;
}
export async function testCommit(options: ITestCommitOptions, message: string,
                                 fileName?: string, contents?: string):
    Promise<string> {
    const tick = testTick();
    const gitOpts = {
        env: {
            GIT_AUTHOR_DATE: `${tick} +0000`,
            GIT_COMMITTER_DATE: `${tick} +0000`,
        },
        workDir: options.workDir,
    } as IGitOptions;

    if (options.committer) {
        const match = options.committer.match(/^(.*)<(.*)>$/);
        if (match) {
            Object.assign(gitOpts.env, {
                GIT_COMMITTER_EMAIL: match[2],
                GIT_COMMITTER_NAME: match[1],
            });
        }
    }

    if (options.author) {
        const match = options.author.match(/^(.*)<(.*)>$/);
        if (match) {
            Object.assign(gitOpts.env, {
                GIT_AUTHOR_EMAIL: match[2],
                GIT_AUTHOR_NAME: match[1],
            });
        }
        if (!options.committer) {
            const match2 = options.author.match(/^(.*)<(.*)>$/);
            if (match2) {
                Object.assign(gitOpts.env, {
                    GIT_COMMITTER_EMAIL: match2[2],
                    GIT_COMMITTER_NAME: match2[1],
                });
            }
        }
    }

    if (!fileName) {
        fileName = `${message}.t`;
    }

    await writeFile(`${options.workDir}/${fileName}`, contents || message);
    await git(["add", "--", fileName], gitOpts);
    await git(["commit", "-m", message, "--", fileName], gitOpts);
    const result = await revParse("HEAD", options.workDir);
    if (!result) {
        throw new Error(`Could not commit ${message}?!?`);
    }
    return result;
}
