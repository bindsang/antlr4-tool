import * as antlr from './antlr-core/index.js'

export async function compile (config) {
    try {
        const result = await antlr.compile(config)
        return result
    } catch (e) {
        console.error(e)
        process.exit(-1)
    }
}
