# ETHCannes
For ETHGlobal Cannes 2025 hackathon, project called "Full Circle" allowing users to experience multi-chain without thinking of gas tokens

Deployed on:
https://full-circle-ethcannes.vercel.app/

RPC is shown as localhost as for demo purpose we do not want user's to use our RPC and flood it with requests, server can easily be binded to 0.0.0.0 to allow public access.
For example sake we be using our server to forward on to Alchemy and Infura RPC's (LoadBalanced).
directing metamask txn -> Localhost RPC -> Gas relay -> Infura / Alchemy RPC.
