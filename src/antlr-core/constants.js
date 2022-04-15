import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const ANTLR_JAR = path.join(
    __dirname,
    '..',
    'bin',
    'antlr-4.10-complete.jar'
)
