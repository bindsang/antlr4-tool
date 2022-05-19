import child from 'child_process'
import path from 'path'
import fs from 'fs'
import ejs from 'ejs'
import os from 'os'
import _ from 'lodash'
import { fileURLToPath } from 'url'
import * as parserUtil from './parser-util.js'

import chdir from 'chdir'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class AntlrCompiler {
    #config
    /** @type {string} */
    #jar
    /** @type {string} */
    #grammarFile
    /** @type {string} */
    #language
    /** @type {string} */
    #outputDirectory

    constructor (config) {
        this.#config = config
        this.#jar = config.antlrJar
        this.#grammarFile = config.grammarFile
        this.#language =
            config.language === 'TypeScript' ? 'JavaScript' : config.language
        this.#outputDirectory = config.outputDirectory
    }

    /**
     *
     * @param {string} grammar
     * @param {any} parser
     * @returns
     */
    compileTypeScriptParser (grammar, parser) {
        const className = `${grammar}Parser`
        const dest = path.join(this.#outputDirectory, className + '.d.ts')
        const template = fs
            .readFileSync(path.join(__dirname, 'templates', 'parser.d.ts.ejs'))
            .toString()

        const contextRules = parserUtil.contextObjectAst(parser)
        const methods = parserUtil.parserMembers(parser)

        const contents = ejs.render(template, {
            _,
            contextRules,
            className,
            methods,
            symbolicNames: parser.constructor.symbolicNames.filter(s => !!s),
            ruleNames: parser.constructor.ruleNames.filter(s => !!s)
        })

        fs.writeFileSync(dest, contents)

        return dest
    }

    /**
     *
     * @param {string} s
     * @returns
     */
    capitalize (s) {
        return s.charAt(0).toUpperCase() + s.slice(1)
    }

    /**
     *
     * @param {string} grammar
     * @param {any} parser
     * @returns
     */
    compileTypeScriptListener (grammar, parser) {
        const className = `${grammar}Listener`
        const dest = path.join(this.#outputDirectory, className + '.d.ts')
        const template = fs
            .readFileSync(
                path.join(__dirname, 'templates', 'listener.d.ts.ejs')
            )
            .toString()
        const [map, labels] = parserUtil.ruleAndLabelContextTypeMap(parser)
        const imports = [
            {
                import: grammar,
                from: grammar.endsWith('Parser')
                    ? `./${grammar}`
                    : `./${grammar}Parser`
            }
        ]
        const methods = _.map([...parser.ruleNames, ...labels], rule => {
            const capitializeRule = this.capitalize(rule)
            const enter = 'enter' + capitializeRule
            const exit = 'exit' + capitializeRule
            const argType = grammar + '.' + map.get(rule)
            const returnType = 'void'
            return { enter, exit, argType, returnType }
        })
        const contents = ejs.render(template, {
            _,
            capitalize: this.capitalize,
            imports,
            className,
            methods
        })
        fs.writeFileSync(dest, contents)

        return dest
    }

    /**
     *
     * @param {string} grammar
     * @param {any} parser
     * @returns
     */
    compileTypeScriptVisitor (grammar, parser) {
        const className = `${grammar}Visitor`
        const dest = path.join(this.#outputDirectory, className + '.d.ts')
        const template = fs
            .readFileSync(path.join(__dirname, 'templates', 'visitor.d.ts.ejs'))
            .toString()
        const [map, labels] = parserUtil.ruleAndLabelContextTypeMap(parser)

        const imports = [
            {
                import: grammar,
                from: grammar.endsWith('Parser')
                    ? `./${grammar}`
                    : `./${grammar}Parser`
            }
        ]
        const methods = _.map([...parser.ruleNames, ...labels], rule => {
            return {
                name: 'visit' + this.capitalize(rule),
                argType: grammar + '.' + map.get(rule),
                returnType: 'void'
            }
        })

        const contents = ejs.render(template, {
            _,
            imports,
            className: className,
            methods: methods
        })

        fs.writeFileSync(dest, contents)

        return dest
    }

    /**
     *
     * @param {string} grammar
     * @returns
     */
    compileTypeScriptLexer (grammar, lexer) {
        const className = `${grammar}Lexer`
        const dest = path.join(this.#outputDirectory, className + '.d.ts')
        const template = fs
            .readFileSync(path.join(__dirname, 'templates', 'lexer.d.ts.ejs'))
            .toString()

        const fields = _.flatten(
            _.map(lexer.constructor.ruleNames, rule => {
                return [`static readonly ${rule}: number`]
            })
        )
        fields.push('static readonly EOF: number')

        const contents = ejs.render(template, {
            _: _,
            className: className,
            ruleNames: lexer.constructor.ruleNames
        })

        fs.writeFileSync(dest, contents)

        return dest
    }

    /**
     *
     * @param {{ grammar: string, filesGenerated: string[] }} compliedResults
     * @returns
     */
    async compileTypeScript (compliedResults) {
        const grammar = compliedResults.grammar
        const parserFile = path.join(
            this.#outputDirectory,
            grammar + 'Parser.js'
        )

        if (fs.existsSync(parserFile)) {
            const parser = await parserUtil.readParser(grammar, parserFile)
            if (this.#config.listener) {
                let actualGrammar
                let listenerFile = path.join(
                    this.#outputDirectory,
                    grammar + 'Listener.js'
                )
                if (fs.existsSync(listenerFile)) {
                    actualGrammar = grammar
                } else {
                    listenerFile = path.join(
                        this.#outputDirectory,
                        grammar + 'ParserListener.js'
                    )
                    if (fs.existsSync(listenerFile)) {
                        actualGrammar = grammar + 'Parser'
                    }
                }

                if (actualGrammar) {
                    const listenerDefFile = this.compileTypeScriptListener(
                        actualGrammar,
                        parser
                    )
                    compliedResults.filesGenerated.push(listenerDefFile)
                }
            }

            if (this.#config.visitor) {
                let actualGrammar
                let visitorFile = path.join(
                    this.#outputDirectory,
                    grammar + 'Visitor.js'
                )
                if (fs.existsSync(visitorFile)) {
                    actualGrammar = grammar
                } else {
                    visitorFile = path.join(
                        this.#outputDirectory,
                        grammar + 'ParserVisitor.js'
                    )
                    if (fs.existsSync(visitorFile)) {
                        actualGrammar = grammar + 'Parser'
                    }
                }
                if (actualGrammar) {
                    const visitorDefFile = this.compileTypeScriptVisitor(
                        actualGrammar,
                        parser
                    )
                    compliedResults.filesGenerated.push(visitorDefFile)
                }
            }

            const lexerFile = path.join(
                this.#outputDirectory,
                grammar + 'Lexer.js'
            )
            let lexer = await parserUtil.readLexer(grammar, lexerFile)
            const lexerPath = this.compileTypeScriptLexer(grammar, lexer)
            compliedResults.filesGenerated.push(lexerPath)

            const parserPath = this.compileTypeScriptParser(grammar, parser)
            compliedResults.filesGenerated.push(parserPath)
        }

        return compliedResults
    }

    /**
     *
     * @returns {{ grammar: string, filesGenerated: string[] }}
     */
    compile () {
        const dir = path.dirname(this.#grammarFile)
        const baseGrammarName = path
            .basename(this.#grammarFile)
            .replace('.g4', '')
        /** @type { string[]} */
        let filesGenerated
        let grammar

        chdir(dir, () => {
            const cmd = this.command()
            try {
                child.execSync(cmd).toString()
            } catch (error) {
                process.exit(1)
            } finally {
                console.info(cmd)
            }

            /** @type {string[]} */
            const extensions = [
                ...this.#config.extensions,
                '.interp',
                '.tokens'
            ]
            filesGenerated = _.filter(
                fs.readdirSync(this.#outputDirectory),
                file => extensions.some(ext => file.endsWith(ext))
            )

            filesGenerated = _.filter(filesGenerated, file =>
                file.startsWith(baseGrammarName, 0)
            )
            filesGenerated = _.filter(
                filesGenerated,
                file => !file.includes('Listener.') || this.#config.listener
            )
            filesGenerated = _.filter(
                filesGenerated,
                file => !file.includes('Visitor.') || this.#config.visitor
            )

            const list = _.filter(filesGenerated, file =>
                /(.*Lexer\..*)|(.*Parser\..*)/.test(file)
            )
            if (!_.isEmpty(list)) {
                grammar = _.first(list).replace(/(Lexer.*)|(Parser.*)/, '')
            } else {
                grammar = baseGrammarName
            }

            // Set the absolute paths on all the files
            filesGenerated = _.map(filesGenerated, file =>
                path.join(this.#outputDirectory, file)
            )
        })

        return { grammar, filesGenerated }
    }

    command () {
        const grammar = path.basename(this.#grammarFile)
        const opts = this.additionalCommandOpts()
        return `java -jar ${this.#jar} -Dlanguage=${
            this.#language
        } ${opts} -lib . -o ${this.#outputDirectory} ${grammar}`
    }

    additionalCommandOpts () {
        let optsStr = ''

        if (this.#config.listener) {
            optsStr += ` -listener`
        } else {
            optsStr += ` -no-listener`
        }

        if (this.#config.visitor) {
            optsStr += ` -visitor`
        } else {
            optsStr += ` -no-visitor`
        }

        return optsStr
    }
}
