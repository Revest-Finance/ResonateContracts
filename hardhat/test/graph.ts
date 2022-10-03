import { createClient } from 'urql'
// you should use axios - Ryan :P
import fetch from 'cross-fetch';


const APIURL = 'https://gateway.thegraph.com/api/afcbfff454b4ed57d4e5abc8634f1b3f/subgraphs/id/4yx4rR6Kf8WH4RJPGhLSHojUxJzRWgEZb51iTran1sEG'
// const APIURL = "https://gateway.thegraph.com/api/afcbfff454b4ed57d4e5abc8634f1b3f/subgraphs/id/4yx4rR6Kf8WH4RJPGhLSHojUxJzRWgEZb51iTran1sEG"


const tokensQuery = `
{
    systemStates(first: 5) {
      id
      registryContract
      contractCount
      gaugeCount
    }
    accounts(first: 5) {
      id
      address
      gauges {
        id
      }
      gaugeWeightVotes {
        id
      }
    }
  }
`

const client = createClient({
  url: APIURL,
})

const data = client.query(tokensQuery).toPromise().then((res) => {
    console.log(res)
})