import Corestore from 'corestore'
import Autobase from 'autobase'
import ram from 'random-access-memory'

async function main(){
    const store = new Corestore(ram)
    const userA = store.get({ name: 'userA' })
    const userB = store.get({ name: 'userB' })

    // Make an Autobase with those two users as inputs.

    const baseA = new Autobase({ inputs: [userA, userB], localInput: userA })
    const baseB = new Autobase({ inputs: [userA, userB], localInput: userB })

    const baseC = new Autobase([userA, userB]) 

    await baseA.append('A0: hello! anybody home?', []) // An empty array as a second argument means "empty clock"
    await baseB.append('B0: hello! first one here.', [])
    await baseA.append('A1: hmmm. guess not.', [])
    await baseB.append('B1: anybody home?', [])
    await baseB.append('B2: yo?', [])
    await baseB.append('B3: yo?', [])
    await baseB.append('B4: yo?', [])
    await baseB.append('B5: yo?', [])
    await baseB.append('B6: yo?', [])
    await baseA.append('A2: sup', [])
    await baseA.append('A3: sup', [])
    await baseA.append('A4: sup', [])
    await baseB.append('B7: looks like we\'re both online!')
    await baseA.append('A5: oops. gone again', [])
    await baseB.append('B8: hello?', [])

    
    const viewCore = store.get({ name: 'view-core' })
    baseA.start({
        viewCore,
        async apply (core, batch, clock, change) {
            batch = batch.map(({value }) => {
                return Buffer.from(value.toString().toUpperCase());
            })
            await baseA.view.append(batch)
        }}
    )

    baseC.start({
        viewCore,
        autocommit: false // Ignore this for now
    })

    // This will piggy-back off of the work `viewCore` has already done.
    await baseC.view.update()


    await baseA.view.update()

    console.log(`length: ${baseA.view.status.length}, appended: ${baseA.view.status.appended}, truncated ${baseA.view.status.truncated}`)

    await baseB.append('B9: tirly pirly', [])
    await baseB.append('B10: tirly pirly', [])
    await baseA.view.update()


    console.log(`length: ${baseA.view.status.length}, appended: ${baseA.view.status.appended}, truncated ${baseA.view.status.truncated}`)

    await baseA.append('A6: tirly pirly', [])
    await baseA.append('A7: tirly pirly', [])
    await baseA.append('A8 tirly pirly', [])
    await baseA.view.update()


    console.log(`length: ${baseA.view.status.length}, appended: ${baseA.view.status.appended}, truncated ${baseA.view.status.truncated}`)


    let view = baseC.view
    // The block at index 0 is a header block, so we skip over that.
    for (let i = 0; i < view.length; i++) {
      const node = await view.get(i)
      console.log(node.value.toString())
    }
}

main();
