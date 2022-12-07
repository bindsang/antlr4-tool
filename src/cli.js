import commander from 'commander'
import fs from 'fs'
import path from 'path'
import _ from 'lodash'
import chalk from 'chalk'
import { fileURLToPath } from 'url'
import { compile } from './compile.js'
import finder from 'find-package-json'
import * as https from 'https'
import * as constants from './antlr-core/constants.js'

const log = console.log

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {string[]} */
let antlrGrammars
const finderIterator = finder(__dirname)
const packageJson = finderIterator.next().value

const opts = commander
    .name(packageJson.name)
    .version(packageJson.version)
    .arguments('<grammars...>')
    .option(
        '-o --output-dir [output_dir]',
        'Output Directory (Default: Current Directory)'
    )
    .option(
        '-l --language [language]',
        'Antlr Language Target: ts, typescript, js, javascript (Default: typescript)'
    )
    .option('--listener', 'Generate parse tree listener (Default)')
    .option('--no-listener', "Don't generate parse tree listener")

    .option('--visitor', 'Generate parse tree visitor (Default)')
    .option('--no-visitor', "Don't generate parse tree visitor")
    .action((...grammars) => (antlrGrammars = _.flatten(grammars.slice(0, -1))))
    .parse(process.argv)

/** @type {any} */
const config = {}

if (_.isNil(antlrGrammars)) {
    opts.help(str => `Please specify grammar files.\n${str}`)
    process.exit(1)
}

config.language = _.isNil(opts['language']) ? 'TypeScript' : opts['language']
config.grammarFiles = antlrGrammars
config.outputDirectory = _.isNil(opts['outputDir']) ? '.' : opts['outputDir']
config.visitor = opts['visitor']
config.listener = opts['listener']

log(`Compiling ${antlrGrammars.join(', ')}...`)

_.each(antlrGrammars, file => {
    if (fs.existsSync(file) === false) {
        log(`The file ${file} doesn't exists.`)
        process.exit(1)
    } else if (fs.statSync(file).isFile() === false) {
        log(`${file} is not a file.`)
        process.exit(1)
    }
})


async function ensureAntlrJar () {
  const jarFile = constants.ANTLR_JAR
  log(jarFile)
  if (fs.existsSync(jarFile)) {
      return
  }

  const { dir, base } = path.parse(jarFile)
  if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
  }
  log(`downloading ANTLR tool: ${base}`)
  const tmpFile = jarFile + '.tmp'
  const antlrJarUrl = `https://www.antlr.org/download/antlr-${constants.ANTLR_VERSION}-complete.jar`
  await new Promise((resolve, reject) => {
      const req = https.get(antlrJarUrl, res => {
          const output = fs.createWriteStream(tmpFile)
          res.on('error', reject)
              .pipe(output)
              .on('error', reject)
              .on('close', resolve)
      })
      req.on('error', reject)
  })
  fs.renameSync(tmpFile, jarFile)
}

async function main () {
    await ensureAntlrJar()
    const compileResults = await compile(config)
    _.each(compileResults, (files, grammar) => {
        _.each(files, file => {
            log(`Generated ${chalk.blue.underline(file)}`)
        })
    })
}

main()
