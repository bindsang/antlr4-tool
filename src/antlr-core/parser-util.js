import fs from 'fs'
import _ from 'lodash'
import * as util from './util.js'
import * as vm from 'vm'
import { fileURLToPath, pathToFileURL } from 'url'
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
        const mainUrl = pathToFileURL(this.#mainFile).toString()
        const rootModule = await this.#resolveModule(mainUrl)
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

    const map = ruleToContextTypeMap(parser)
    const list = classContextRules(parser.constructor)
    const ruleClsList = [...map.values()]
    const labels = {}
    for (const cls of list) {
        const clsName = cls.name
        if (ruleClsList.includes(clsName)) {
            continue
        }

        // '#' 定义的label 类
        if (cls.name.endsWith('Context')) {
            const label = clsName.replace(/Context$/, '')
            labels['#' + label] = {
                clsName,
                superName: Object.getPrototypeOf(cls).name
            }
        }
    }

    parser.labels = labels
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

export function parserMembers (parser) {
    const ruleToContextMap = ruleToContextTypeMap(parser)
    const symbols = symbolSet(parser)

    const members = util.getMembers(parser.constructor)
    const ownMembers = _.filter(
        members,
        method => ruleToContextMap.has(method.name) || symbols.has(method.name)
    )
    return _.map(ownMembers, method => {
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
 * Return all modules AST of all the rules
 * @param {any} parser
 * @returns [...,{id: string, type: string}]
 */
export function contextObjectAst (parser) {
    const parserCls = parser.constructor
    const contextTypes = classContextRules(parserCls)
    const ruleToContextMap = ruleToContextTypeMap(parser)
    const symbols = symbolSet(parser)

    return _.map(contextTypes, contexType => {
        const obj = {}
        const content = contexType.toString()
        obj.name = contexType.name
        obj.superName = Object.getPrototypeOf(contexType).name
        const members = _.filter(
            util.getMembers(contexType),
            mth => mth !== 'depth'
        )
        const ownMembers = _.filter(
            members,
            member =>
                member.type === 'field' ||
                ruleToContextMap.has(member.name) ||
                symbols.has(member.name)
        )

        obj.members = _.map(ownMembers, member => {
            const memberObj = {}
            memberObj.name = member.name
            memberObj.type = member.type
            if (member.type === 'method') {
                memberObj.args = member.args

                if (ruleToContextMap.has(member.name)) {
                    const typeName = ruleToContextMap.get(member.name)
                    const ctxCls = parserCls[typeName]
                    if (
                        !!Object.getOwnPropertyDescriptor(
                            ctxCls.prototype,
                            'copyFrom'
                        )
                    ) {
                        memberObj.genericType = `<T extends ${ctxCls.name}>`
                        memberObj.returnType = 'T'
                    } else {
                        memberObj.returnType = ctxCls.name
                    }
                } else if (symbols.has(member.name)) {
                    memberObj.returnType = 'TerminalNode'
                }
                if (member.list) {
                    memberObj.returnType += '[]'
                }
            } else {
                /** @type {string} */
                const pattern = new RegExp(
                    `this\\.${member.name}\\s*=\\s*(null|\\[]);.+?//\\s+(of\\s+)?(\\w+);?$`,
                    'im'
                )
                const matcher = pattern.exec(content)
                let memberType = matcher[3]
                memberObj.returnType =
                    matcher[1] === 'null'
                        ? memberType
                        : memberType.substring(0, memberType.length - 1) + '[]'
            }
            return memberObj
        }).sort((a, b) => {
            const scoreA = a.type === 'field' ? -1 : 1
            const scoreB = b.type === 'field' ? -1 : 1
            return scoreA - scoreB
        })

        return obj
    })
}
