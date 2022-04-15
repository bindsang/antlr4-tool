import fs from 'fs'
import _ from 'lodash'
import * as util from './util.js'
import * as vm from 'vm'
import { fileURLToPath } from 'url'
import { Module } from 'module'

class ModuleResolver {
    /** @type {Map<string, vs.Module>} */
    #moduleMap = new Map()
    /** @type {string} */
    #mainFile

    /**
     *
     * @param {string} mainFile
     */
    constructor (mainFile) {
        this.#mainFile = mainFile
    }

    async resolve () {
        const rootModule = await this.#resolveModule(this.#mainFile)
        await rootModule.link(this.#resolveModule.bind(this))
        await rootModule.evaluate()
        return rootModule
    }

    /**
     *
     * @param {string} specifier
     * @param {vm.Module} parent
     * @returns
     */
    async #resolveModule (specifier, parent) {
        const builtin = Module.builtinModules.includes(specifier)
        if (builtin) {
            const builtinPath = 'node:' + specifier
            if (this.#moduleMap.has(builtinPath)) {
                return this.#moduleMap.get(builtinPath)
            }
            const raw = await import(specifier)
            const m = new vm.SyntheticModule(
                ['default'],
                () => m.setExport('default', raw),
                {
                    identifier: specifier,
                    context:
                        parent?.context || vm.createContext({ exports: {} })
                }
            )
            this.#moduleMap.set(builtinPath, m)
            return m
        }

        let modUrl
        if (specifier.startsWith('.') && parent) {
            modUrl = await import.meta.resolve(specifier, parent.identifier)
        } else {
            modUrl = await import.meta.resolve(specifier)
        }
        const modPath = fileURLToPath(modUrl)
        if (this.#moduleMap.has(modPath)) {
            return this.#moduleMap.get(modPath)
        }
        const content = fs.readFileSync(modPath, 'utf-8')
        const mod = new vm.SourceTextModule(content, {
            identifier: modUrl,
            context: parent?.context || vm.createContext({ exports: {} })
        })
        this.#moduleMap.set(modPath, mod)
        return mod
    }
}

/**
 *
 * @param {string} grammar
 * @param {string} lexerFile
 * @returns
 */
export async function readLexer (grammar, lexerFile) {
    const resolver = new ModuleResolver(lexerFile)
    const esm = await resolver.resolve()
    const Lexer = esm.namespace.default
    const lexer = new Lexer(null)
    return lexer
}

/**
 *
 * @param {string} grammar
 * @param {string} parserFile
 */
export async function readParser (grammar, parserFile) {
    const resolver = new ModuleResolver(parserFile)
    const esm = await resolver.resolve()
    const Parser = esm.namespace.default
    const parser = new Parser(null)
    return parser
}

export function contextRuleNames (parser) {
    return _.map(
        parser.ruleNames,
        rule => `${util.capitalizeFirstLetter(rule)}Context`
    )
}

export function contextRules (parser) {
    const rules = contextRuleNames(parser)

    return _.map(rules, context => {
        return parser.constructor[context]
    })
}

export function classContextRules (parserClass) {
    return Object.keys(parserClass)
        .map(key => parserClass[key])
        .filter(value => typeof value === 'function')
}

export function contextToRuleMap (parser) {
    const map = new Map()
    _.each(parser.ruleNames, rule => {
        const context = `${util.capitalizeFirstLetter(rule)}Context`
        map.set(context, rule)
    })

    return map
}

export function ruleToContextTypeMap (parser) {
    const map = new Map()
    _.each(parser.ruleNames, rule => {
        const context = `${util.capitalizeFirstLetter(rule)}Context`
        map.set(rule, context)
    })

    return map
}

export function symbolSet (parser) {
    const set = new Set()
    _.each(parser.symbolicNames, name => {
        set.add(name)
    })

    return set
}

export function parserMethods (parser) {
    const ruleToContextMap = ruleToContextTypeMap(parser)
    const symbols = symbolSet(parser)

    const methods = util.getMethods(parser)
    const ownMethods = _.filter(
        methods,
        method => ruleToContextMap.has(method.name) || symbols.has(method.name)
    )

    return _.map(ownMethods, method => {
        const methodObj = {}
        methodObj.name = method.name

        if (ruleToContextMap.has(method.name)) {
            methodObj.type = ruleToContextMap.get(method.name)
            methodObj.args = method.args
        } else if (symbols.has(method.name)) {
            methodObj.type = 'TerminalNode'
            methodObj.args = method.args
        }

        return methodObj
    })
}

/**
 *
 * @param parser
 * @returns {string[]}
 */
export function exportedContextTypes (parser) {
    const ParserClass = parser.constructor
    const classCtxNames = classContextRules(ParserClass).map(rule => rule.name)
    const instanceCtxNames = contextRuleNames(parser)
    const ctxNames = _.union(instanceCtxNames, classCtxNames)

    const exportsStatements = _.map(ctxNames, ctxType => {
        return `exports.${ctxType} = ${ctxType};\n${ParserClass.name}.${ctxType} = ${ctxType};\n`
    })

    return exportsStatements
}

/**
 * Return all modules AST of all the rules
 * @param parser
 * @returns [...,{id: string, type: string}]
 */
export function contextObjectAst (parser) {
    const types = classContextRules(parser.constructor)
    const ruleToContextMap = ruleToContextTypeMap(parser)
    const symbols = symbolSet(parser)
    const rules = contextRuleNames(parser)

    return _.map(types, context => {
        const obj = {}
        obj.name = context.name

        const methods = _.filter(
            util.getMethods(context.prototype),
            mth => mth !== 'depth'
        )
        const ownMethods = _.filter(
            methods,
            method =>
                ruleToContextMap.has(method.name) || symbols.has(method.name)
        )

        obj.methods = _.map(ownMethods, method => {
            const methodObj = {}
            methodObj.name = method.name
            methodObj.args = method.args

            if (ruleToContextMap.has(method.name)) {
                methodObj.type = ruleToContextMap.get(method.name)
            } else if (symbols.has(method.name)) {
                methodObj.type = 'TerminalNode'
            }

            return methodObj
        })

        return obj
    })
}
