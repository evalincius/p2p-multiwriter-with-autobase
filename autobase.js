import Corestore from 'corestore'
import Autobase from 'autobase'
import ram from 'random-access-memory'

// Create two chat users, each with their own Hypercores.
// Here since we'll be rerunning the same code a lot, we'll use the ram storage
async function main(){
    const store = new Corestore(ram)
    const userA = store.get({ name: 'userA' })
    const userB = store.get({ name: 'userB' })

    // Make an Autobase with those two users as inputs.

    const baseA = new Autobase({ inputs: [userA, userB], localInput: userA })
    const baseB = new Autobase({ inputs: [userA, userB], localInput: userB })

    await baseA.append('A0: hello! anybody home?', []) // An empty array as a second argument means "empty clock"
    await baseB.append('B0: hello! first one here.', [])
    await baseA.append('A1: hmmm. guess not.', [])
    await baseB.append('B1: anybody home?', [])
    await baseB.append('B2: yo?', [])
    await baseB.append('B3: yo?', [])
    await baseB.append('B34: yo?', [])
    await baseB.append('B5: yo?', [])
    await baseB.append('B6: yo?', [])
    await baseA.append('A2: sup', [])
    await baseA.append('A3: sup', [])
    await baseA.append('A4: sup', [])
    await baseB.append('B7: looks like we\'re both online!')
    await baseA.append('A5: oops. gone again', [])
    await baseB.append('B8: hello?', [])



    // Let's print all messages in causal order
    for await (const node of baseA.createCausalStream()) {
        console.log(node.value.toString())
    }

    // Let's print all messages in causal order
    for await (const node of baseB.createCausalStream()) {
        console.log(node.value.toString())
    }
}

main();
