import path from 'path'
import _ from 'lodash'
import { AntlrCompiler } from './antlr-compiler.js'
import * as constants from './constants.js'

/** @typedef {(compiler: AntlrCompiler) => Promise<{
 *   grammar: string,
 *   filesGenerated: string[]
 * }>} AsyncCompileFunction
 */

/**
 *
 * @param {any} config
 * @param {AsyncCompileFunction} compileFunction
 * @returns
 */
async function compileWithFunction (config, compileFunction) {
    const compiledResults = {}

    for (const grammar of config.grammarFiles) {
        const opts = _.clone(config)
        opts.grammarFile = path.resolve(grammar)
        opts.outputDirectory = path.resolve(config.outputDirectory)

        if (_.isNil(config.antlrJar)) {
            opts.antlrJar = path.resolve(constants.ANTLR_JAR)
        }

        const compiler = new AntlrCompiler(opts)
        const results = await compileFunction(compiler)

        if (!_.isNil(compiledResults[results.grammar])) {
            _.each(results.filesGenerated, val => {
                compiledResults[results.grammar].push(val)
            })
        } else {
            compiledResults[results.grammar] = results.filesGenerated
        }
    }

    // Remove duplicate files
    _.each(compiledResults, (list, key) => {
        compiledResults[key] = _.uniq(list)
    })

    return compiledResults
}

async function compileGrammarAsJavaScript (config) {
    return compileWithFunction(config, async compiler =>
        compiler.compileJavaScript()
    )
}

async function compileGrammarAsTypeScript (config) {
    config = _.clone(config)

    // Define the language as JavaScript for the Antlr4 Jar
    config.language = 'JavaScript'
    return compileWithFunction(config, async compiler =>
        compiler.compileTypeScript()
    )
}

export async function compile (config) {
    config.outputDirectory = path.resolve(config.outputDirectory)

    switch (config.language) {
        case 'js':
        case 'javascript':
        case 'JavaScript':
            config.language = 'JavaScript'
            return compileGrammarAsJavaScript(config)
        case 'ts':
        case 'typescript':
        case 'TypeScript':
            config.language = 'TypeScript'
            return compileGrammarAsTypeScript(config)

        default:
            throw new Error(`Unsupported Language: ${config.language}`)
    }
}
