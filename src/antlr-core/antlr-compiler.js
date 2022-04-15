// const child = require("child_process");
import child from 'child_process'
import path from 'path'
import fs from 'fs'
import ejs from 'ejs'
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
        this.#language = config.language
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
        const dest = `${this.#outputDirectory}/${className}.d.ts`
        const template = fs
            .readFileSync(`${__dirname}/templates/parser.d.ts.ejs`)
            .toString()
        const contextRules = parserUtil.contextObjectAst(parser)
        const methods = parserUtil.parserMethods(parser)

        const contents = ejs.render(template, {
            _,
            contextRules,
            className,
            methods
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
        const dest = `${this.#outputDirectory}/${className}.d.ts`
        const template = fs
            .readFileSync(`${__dirname}/templates/listener.d.ts.ejs`)
            .toString()
        const map = parserUtil.ruleToContextTypeMap(parser)

        const methods = _.flatten(
            _.map(parser.ruleNames, rule => {
                const enterMethodName = `enter${this.capitalize(rule)}`
                const exitMethodName = `enter${this.capitalize(rule)}`
                const paramTypeName = `P.${map.get(rule)}`
                return [
                    `${enterMethodName}(ctx: ${paramTypeName}): void;`,
                    `${exitMethodName}(ctx: ${paramTypeName}): void;`
                ]
            })
        )

        // const imports = _.flatten(
        //     _.map(parser.ruleNames, rule => {
        //         if (grammar.indexOf('Parser') === -1) {
        //             return `import {${map.get(
        //                 rule
        //             )}} from './${grammar}Parser';`
        //         } else {
        //             return `import {${map.get(rule)}} from './${grammar}';`
        //         }
        //     })
        // )

        const imports = []
        if (grammar.indexOf('Parser') === -1) {
            imports.push(`import P from './${grammar}Parser';`)
        } else {
            imports.push(`import P from './${grammar}';`)
        }

        const contents = ejs.render(template, {
            _: _,
            className: className,
            methods: methods,
            imports
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
        const dest = `${this.#outputDirectory}/${className}.d.ts`
        const template = fs
            .readFileSync(`${__dirname}/templates/visitor.d.ts.ejs`)
            .toString()
        const map = parserUtil.ruleToContextTypeMap(parser)

        const methods = _.flatten(
            _.map(parser.ruleNames, rule => {
                const methodName = `visit${this.capitalize(rule)}`
                const paramTypeName = `P.${map.get(rule)}`
                return [`${methodName}(ctx: ${paramTypeName}): void;`]
            })
        )

        // const imports = _.flatten(
        //     _.map(parser.ruleNames, rule => {
        //         if (grammar.indexOf('Parser') === -1) {
        //             return `import P from './${grammar}Parser';`
        //         } else {
        //             return `import P from './${grammar}';`
        //         }
        //     })
        // )

        const imports = []
        if (grammar.indexOf('Parser') === -1) {
            imports.push(`import P from './${grammar}Parser';`)
        } else {
            imports.push(`import P from './${grammar}';`)
        }

        const contents = ejs.render(template, {
            _: _,
            className: className,
            methods: methods,
            imports
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
        const dest = `${this.#outputDirectory}/${className}.d.ts`
        const template = fs
            .readFileSync(`${__dirname}/templates/lexer.d.ts.ejs`)
            .toString()

        const fields = _.flatten(
            _.map(lexer.constructor.ruleNames, rule => {
                return [`static ${rule}: number;`]
            })
        )
        fields.push('static EOF: number;')

        const contents = ejs.render(template, {
            _: _,
            className: className,
            fields: fields
        })

        fs.writeFileSync(dest, contents)

        return dest
    }

    async compileTypeScript () {
        const jsCompliedResults = this.compileJavaScript()
        const grammar = jsCompliedResults.grammar
        const parserFile = `${this.#outputDirectory}/${grammar}Parser.js`

        if (fs.existsSync(parserFile)) {
            let parser = await parserUtil.readParser(grammar, parserFile)
            const lines = parserUtil.exportedContextTypes(parser)

            _.each(lines, line => {
                fs.appendFileSync(parserFile, line)
            })

            // Read Again
            parser = await parserUtil.readParser(grammar, parserFile)

            if (this.#config.listener) {
                if (
                    fs.existsSync(
                        `${this.#outputDirectory}/${grammar}Listener.js`
                    )
                ) {
                    const listenerFile = this.compileTypeScriptListener(
                        grammar,
                        parser
                    )
                    jsCompliedResults.filesGenerated.push(listenerFile)
                } else if (
                    fs.existsSync(
                        `${this.#outputDirectory}/${grammar}ParserListener.js`
                    )
                ) {
                    const listenerFile = this.compileTypeScriptListener(
                        `${grammar}Parser`,
                        parser
                    )
                    jsCompliedResults.filesGenerated.push(listenerFile)
                }
            }

            if (this.#config.visitor) {
                if (
                    fs.existsSync(
                        `${this.#outputDirectory}/${grammar}Visitor.js`
                    )
                ) {
                    const listenerFile = this.compileTypeScriptVisitor(
                        grammar,
                        parser
                    )
                    jsCompliedResults.filesGenerated.push(listenerFile)
                } else if (
                    fs.existsSync(
                        `${this.#outputDirectory}/${grammar}ParserVisitor.js`
                    )
                ) {
                    const listenerFile = this.compileTypeScriptVisitor(
                        `${grammar}Parser`,
                        parser
                    )
                    jsCompliedResults.filesGenerated.push(listenerFile)
                }
            }

            const lexerFile = `${this.#outputDirectory}/${grammar}Lexer.js`
            let lexer = await parserUtil.readLexer(grammar, lexerFile)
            const lexerPath = this.compileTypeScriptLexer(grammar, lexer)
            jsCompliedResults.filesGenerated.push(lexerPath)

            const parserPath = this.compileTypeScriptParser(grammar, parser)
            jsCompliedResults.filesGenerated.push(parserPath)
        }

        return jsCompliedResults
    }

    /**
     *
     * @returns {Promise<{ grammar: string, filesGenerated: string[] }>}
     */
    compileJavaScript () {
        const dir = path.dirname(this.#grammarFile)
        const baseGrammarName = path
            .basename(this.#grammarFile)
            .replace('.g4', '')
        const grammarPrefix = _.first(`${baseGrammarName}`.split(/(?=[A-Z])/))
        /** @type { string[]} */
        let filesGenerated
        let grammar

        chdir(dir, () => {
            child.execSync('which java')

            const cmd = this.command()
            try {
                child.execSync(cmd).toString()
            } catch (error) {
                process.exit(1)
            } finally {
                console.info(cmd)
            }

            const files = fs.readdirSync(this.#outputDirectory)
            filesGenerated = _.filter(files, file =>
                file.startsWith(baseGrammarName, 0)
            )
            filesGenerated = filesGenerated.filter(
                file =>
                    (file.indexOf('Listener.') !== -1 &&
                        this.#config.listener) ||
                    file.indexOf('Listener.') === -1
            )
            filesGenerated = filesGenerated.filter(
                file =>
                    (file.indexOf('Visitor.') !== -1 && this.#config.visitor) ||
                    file.indexOf('Visitor.') === -1
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
            filesGenerated = _.map(
                filesGenerated,
                file => `${this.#outputDirectory}/${file}`
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
