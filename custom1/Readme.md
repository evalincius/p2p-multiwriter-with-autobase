This example allows initial hypercores to be anonced that neew peers has joined


On hypernews start, we register custom Extension for each hypercore we connectig to.

once new peer added to hypercore "peer-add" event is triggered and message containing writter key is sent

hypercore that peer was added to receives an extension msg and add this new core to autobase

since newly cennected hypernews instance with new hypercore also subscribes to "peer-add" event, it receives them from older peers
but autobase handles duplicates


