import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const ANTLR_VERSION = '4.11.0'
export const ANTLR_JAR = path.join(
    __dirname,
    '..',
    'bin',
    `antlr-${ANTLR_VERSION}-complete.jar`
)
