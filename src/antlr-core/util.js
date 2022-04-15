import path from 'path'

const ignores = [
    'enterRule',
    'exitRule',
    'accept',
    'parentCtx',
    'children',
    'start',
    'stop',
    'ruleIndex',
    'exception',
    'invokingState',
    'parentCtx',
    'parser'
]

export function getMembers (cls) {
    const result = []
    const inst = new cls()
    const props = [
        ...Object.keys(inst),
        ...Object.getOwnPropertyNames(cls.prototype)
    ]
    for (const id of props) {
        if (id.startsWith('_') || ignores.includes(id)) {
            continue
        }

        try {
            const member = inst[id]
            const type = typeof member
            switch (type) {
                case 'function':
                    {
                        if (member.length === 0) {
                            result.push({
                                name: id,
                                type: 'method',
                                args: '',
                                list: false
                            })
                        } else if (member.length === 1) {
                            result.push(
                                {
                                    name: id,
                                    type: 'method',
                                    args: '',
                                    list: true
                                },
                                {
                                    name: id,
                                    type: 'method',
                                    args: 'index: number',
                                    list: false
                                }
                            )
                        }
                    }
                    break
                case 'object':
                    result.push({ name: id, type: 'field' })
                    break
                default:
                    break
            }
        } catch (err) {}
    }

    return result
}

export function grammar (config) {
    const grammarFile = config.grammar
    return path.basename(grammarFile, '.g4')
}

export function capitalizeFirstLetter (val) {
    return val.charAt(0).toUpperCase() + val.slice(1)
}
