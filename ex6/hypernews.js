import minimist from 'minimist'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Autobase from 'autobase'
import Hyperbee from 'hyperbee'
import crypto from 'crypto'
import lexint from 'lexicographic-integer'
import ram from 'random-access-memory'


// parse argument options
const args = minimist(process.argv, {
    alias: {
      writers: 'w',
      indexes: 'i',
      storage: 's',
      name: 'n'
    },
    default: {
      swarm: true
    },
    boolean: ['ram', 'swarm']
  })


let writer;
let viewOutput;
class Hypernews {
    constructor () {
        this.store = new Corestore(args.ram ? ram : (args.storage || 'hypernews'))
        this.swarm = null
        this.autobase = null
        this.bee = null
        this.name = null
      }

    async start () {
        writer = this.store.get({ name: 'writer' })
        viewOutput = this.store.get({ name: 'view' })

        await writer.ready()
        await viewOutput.ready()

        this.name = args.name || writer.key.slice(0, 8).toString('hex')

        this.autobase = new Autobase({ 
            inputs: [writer], 
            localInput: writer, 
            outputs: [viewOutput]
        })
          
        for (const w of [].concat(args.writers || [])) {
            await this.autobase.addInput(this.store.get(Buffer.from(w, 'hex')))
        }

        for (const i of [].concat(args.indexes || [])) {
            await this.autobase.addOutput(this.store.get(Buffer.from(i, 'hex')))
        }

        await this.autobase.ready()

        if (args.swarm) {
            const topic = Buffer.from(sha256(this.name), 'hex')
            this.swarm = new Hyperswarm()
            this.swarm.on('connection', (socket) => this.store.replicate(socket))
            this.swarm.join(topic)
            await this.swarm.flush()
            process.once('SIGINT', () => this.swarm.destroy()) // for faster restarts
        }
    
        this.info()


        
        const self = this

        this.autobase.start({
            unwrap: true,
            apply: this.applyAutobeeBatch,
            view: this.setHyperbeeAsAutobaseView
        })
        this.autobase.ready()
        this.bee = this.autobase.view
    }

    async applyAutobeeBatch (bee, batch) {
        const b = bee.batch({ update: false })
        for (const { value } of batch) {
            const op = JSON.parse(value)
            if (op.type === 'post') {
                const hash = sha256(op.data)
                await b.put('posts!' + hash, { hash, votes: 0, data: op.data })
                await b.put('top!' + lexint.pack(0, 'hex') + '!' + hash, hash)

            }
            if (op.type === 'vote') {
                const post = await bee.get('posts!' + op.hash, { update: false })
                if(!post){
                    continue
                }
                await b.del('top!' + lexint.pack(post.value.votes, 'hex') + '!' + op.hash)
                const currentVote = post.value.votes

                if(op.up){
                    post.value.votes = currentVote + 1
                }else{
                    post.value.votes = currentVote - 1
                }
                await b.put('posts!' + op.hash, post.value)
                await b.put('top!' + lexint.pack(post.value.votes, 'hex') + '!' + op.hash, op.hash)

            }
        }
        await b.flush()
    }

    setHyperbeeAsAutobaseView (core) {
        return new Hyperbee(core.unwrap(), {
            extension: false,
            keyEncoding: 'utf-8',
            valueEncoding: 'json'
          })
    }

    info () {
        console.log('Autobase setup. Pass this to run this same setup in another instance:')
        console.log()
        console.log('hrepl hypernews.js ' +
          '-n ' + this.name + ' ' +
          this.autobase.inputs.map(i => '-w ' + i.key.toString('hex')).join(' ') + ' ' +
          this.autobase.outputs.map(i => '-i ' + i.key.toString('hex')).join(' ')
        )
        console.log()
        console.log('To use another storage directory use --storage ./another')
        console.log('To disable swarming add --no-swarm')
        console.log()
    }

    async post (message) {
        const hash = sha256(message)

        await this.autobase.append(JSON.stringify({
            type: 'post',
            hash,
            data: message
        }))
    }

    async upvote (hash) {
        await this.autobase.append(JSON.stringify({
          type: 'vote',
          hash,
          up: true
        }))
      }
    
      async downvote (hash) {
        await this.autobase.append(JSON.stringify({
          type: 'vote',
          hash,
          up: false
        }))
      }
    
    async * all () {
        for await (const data of this.bee.createReadStream({ gt: 'posts!', lt: 'posts!~' })) {
            yield data.value
        }
    }

    async * top () {
        for await (const data of this.bee.createReadStream({ gt: 'top!', lt: 'top!~', reverse: true })) {
          const { value } = (await this.bee.get('posts!' + data.value))
          yield value
        }
      }

    async logCores(){
        console.log(writer)
        for (let i = 0; i < writer.length; i++) {
            const block = await writer.get(i);
            console.log(block.toString());
        }

        console.log('-------------------')

        for await (const node of this.autobase.createCausalStream()) {
            console.log(node.value.toString())
          }
    }

}

export const hypernews = new Hypernews()

await hypernews.start()

function sha256 (inp) {
  return crypto.createHash('sha256').update(inp).digest('hex')
}