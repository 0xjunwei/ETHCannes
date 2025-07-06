# ETHCannes
For ETHGlobal Cannes 2025 hackathon, project called "Full Circle" allowing users to experience multi-chain without thinking of gas tokens

Deployed on:
https://eth-cannes.vercel.app/

Presentation Slides:
https://www.canva.com/design/DAGsS6DjTO0/ZH0dvXUsCQ-I8D98Yd9Spg/edit?utm_content=DAGsS6DjTO0&utm_campaign=designshare&utm_medium=link2&utm_source=sharebutton

RPC is shown as localhost as for demo purpose we do not want user's to use our RPC and flood it with requests, server can easily be binded to 0.0.0.0 to allow public access.

For example sake we be using our server to forward on to Alchemy and Infura RPC's (LoadBalanced).

directing metamask txn -> Localhost RPC -> Gas relay -> Infura / Alchemy RPC.

Architecture:
High level overview

![high level architecture](https://github.com/user-attachments/assets/9780a1c1-c4f1-4230-9c22-3d69e565bc96)

Gas Relay Mechanism:

![gasrelay](https://github.com/user-attachments/assets/f597776f-b152-42ec-a969-f7b273d9a0c4)
