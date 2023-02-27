import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const ANTLR_VERSION = getAntlr4Version()
export const ANTLR_JAR = path.join(
    __dirname,
    '..',
    'bin',
    `antlr-${ANTLR_VERSION}-complete.jar`
)

function getAntlr4Version () {
    let currentDir = __dirname
    let mainDir
    while (true) {
        const fileName = path.join(currentDir, 'package.json')
        if (fs.existsSync(fileName)) {
            mainDir = currentDir
            break
        }
        const parentDir = path.dirname(currentDir)
        if (!parentDir || parentDir === currentDir) {
            break
        }
        currentDir = parentDir
    }

    if (!mainDir) {
        throw new Error('未找到主模块入口目录')
    }

    const fileName = path.join(
        mainDir,
        'node_modules',
        'antlr4',
        'package.json'
    )
    if (fs.existsSync(fileName)) {
        const content = fs.readFileSync(fileName, 'utf8')
        const pkg = JSON.parse(content)
        return pkg.version
    }

    throw new Error('未找到当前使用的antlr4依赖包')
}
