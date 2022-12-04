import minimist from 'minimist'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Autobase from 'autobase'
import Hyperbee from 'hyperbee'
import crypto from 'crypto'
import lexint from 'lexicographic-integer'
import ram from 'random-access-memory'
import chalk from 'chalk';



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
          
        const listOfPeers = [].concat(args.writers || [])

        if(listOfPeers.length == 0 ) {
          console.log(chalk.blueBright('Acting as Initiator'))
          console.log(chalk.blueBright(`Key to join Room: ${writer.key.toString('hex')}` ))
          this.setupAutobaseExtension(writer)

        } else {
          console.log(chalk.blueBright('Acting as Peer'))
          console.log(chalk.blueBright(`Key to join Room: ${writer.key.toString('hex')}` ))

          for (const w of listOfPeers) {
            const coreToJoin = this.store.get(Buffer.from(w, 'hex'))
            this.setupAutobaseExtension(coreToJoin)
            await this.autobase.addInput(coreToJoin)
         }
        }

        for (const i of [].concat(args.indexes || [])) {
            await this.autobase.addOutput(this.store.get(Buffer.from(i, 'hex')))
        }

        await this.autobase.ready()
        this.autobase.on('append', async function () {
          console.log(chalk.green('---> Autobase was updated'));
        });

        if (args.swarm) {
            const topic = Buffer.from(sha256(this.name), 'hex')
            this.swarm = new Hyperswarm()
            this.swarm.on('connection', (socket, info) => {
          
              socket.on("connect", () => {
                console.log(chalk.greenBright('---> Connected to Socket'))
              });

              this.store.replicate(socket)
            })

            const discovery = this.swarm.join(topic)
            await this.swarm.flush()

            process.once('SIGINT', () => {
              console.log(chalk.red('---> ON SIGINT'));
              this.swarm.leave(topic)
              this.swarm.destroy()
            }) // for faster restarts
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

    setupAutobaseExtension(hypercore) {

      console.log('setupAutobaseExtension called ');

      const hyp = hypercore;
      const addWritersExt = hypercore.registerExtension('polycore', {
        encoding: 'json',
        onmessage: async msg => {
          console.log('called here');
          console.log(`from:  ${msg.writers} at ${hyp.key.toString('hex')}`)
          const coreToJoin = this.store.get(Buffer.from(msg.writers, 'hex'))
          await this.autobase.addInput(coreToJoin)
        }
		  })
      

      hypercore.on('peer-add', peer => {
        console.log('peer-add called');
        addWritersExt.send({
          writers: writer.key.toString('hex'),
        }, peer)
      })

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
        console.log('hrepl custom1/hypernews.js ' +
          '-n ' + this.name + ' ' +
          this.autobase.inputs.map(i => '-w ' + i.key.toString('hex')).join(' ') + ' ' +
          this.autobase.outputs.map(i => '-i ' + i.key.toString('hex')).join(' ')
        )
        console.log()
        console.log('To use another storage directory use --storage ./another')
        console.log('To disable swarming add --no-swarm')
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

    listPeers() {
      const root = this.store.get(Buffer.from('a5437f87c684bd83b2347aa287953aa8baba8420223a096cf4abb07814533400', 'hex'))
      console.log(root)

      console.log('listing peers for a5437f87c684bd83b2347aa287953aa8baba8420223a096cf4abb07814533400')

      root.peers.map(peer => console.log(peer))

    }

}

export const hypernews = new Hypernews()

await hypernews.start()

function sha256 (inp) {
  return crypto.createHash('sha256').update(inp).digest('hex')
}