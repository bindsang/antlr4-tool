import path from 'path'
import _ from 'lodash'
import { AntlrCompiler } from './antlr-compiler.js'
import * as constants from './constants.js'

/**
 * @typedef {(compiler: AntlrCompiler) => Promise<{
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

async function compileGrammar (config) {
    return compileWithFunction(config, async compiler => compiler.compile())
}

async function compileGrammarAsTypeScript (config) {
    config = _.clone(config)

    return compileWithFunction(config, async compiler => {
        const compliedResults = compiler.compile()
        await compiler.compileTypeScript(compliedResults)
        return compliedResults
    })
}

export async function compile (config) {
    config.outputDirectory = path.resolve(config.outputDirectory)

    const lower = config.language.toLowerCase()
    switch (lower) {
        case 'js':
        case 'javascript':
            config.language = 'JavaScript'
            config.extensions = ['.js']
            return compileGrammar(config)
        case 'ts':
        case 'typescript':
            config.language = 'TypeScript'
            config.extensions = ['.js', '.d.ts']
            return compileGrammarAsTypeScript(config)
        case 'py3':
        case 'python3':
            config.language = 'Python3'
            config.extensions = ['.py']
            return compileGrammar(config)
        case 'go':
            config.language = 'Go'
            config.extensions = ['.go']
            return compileGrammar(config)
        default:
            throw new Error(`Unsupported Language: ${config.language}`)
    }
}
