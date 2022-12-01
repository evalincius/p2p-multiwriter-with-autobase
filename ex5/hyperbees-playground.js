import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Autobase from 'autobase'
import Hyperbee from 'hyperbee'
import ram from 'random-access-memory'
import crypto from 'crypto'

const store = new Corestore(ram)
const writer = store.get({ name: 'writer' })
const viewOutput = store.get({ name: 'view' })

await writer.ready()
await viewOutput.ready()

const autobase = new Autobase({ 
    inputs: [writer], 
    localInput: writer, 
    outputs: [viewOutput], 
  })


autobase.start({
    unwrap: true,
    async apply (core, batch, clock, change) {

        console.log('callled here')

        // if you want to insert/delete batched values
        const b = db.batch({ update: false })

        await b.put('key', 'value')
        await b.flush() // execute the batch
    },
    view: core => {
        console.log('called here!!!!')

        return new Hyperbee(core.unwrap(), {
            extension: false,
            keyEncoding: 'utf-8',
            valueEncoding: 'utf-8'
          })
    }
}
)
await autobase.ready()

const db = autobase.view


// const db = new Hyperbee(autobase.view, {
//     extension: false,
//     keyEncoding: 'utf-8', // can be set to undefined (binary), utf-8, ascii or and abstract-encoding
//     valueEncoding: 'utf-8' // same options as above
// })


await autobase.append('a')


const node = await db.get('key') // null or { key, value }
console.log(node)
// for await (const data of db.createReadStream({ gt: 'k', lt: 'k~' })) {
//     console.log('asdasdasd')
//     console.log(data.value)
// }