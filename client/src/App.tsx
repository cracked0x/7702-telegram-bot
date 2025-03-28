import {
  useDebug,
  useBalance,
  nukeEverything,
  useNukeEverything,
} from './hooks.ts'
import { Hooks } from 'porto/wagmi'
import { porto, wagmiConfig } from './config.ts'
import { ExperimentERC20 } from './contracts.ts'
import { useAccount, useConnectors } from 'wagmi'
import { truncateHexString } from './utilities.ts'
import { useMutation } from '@tanstack/react-query'
import { type Errors, type Hex, Json, Value } from 'ox'
import { SERVER_URL, permissions } from './constants.ts'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useCallsStatus, useSendCalls } from 'wagmi/experimental'

export function App() {
  useNukeEverything()

  const telegramUserId = new URLSearchParams(window.location.search).get('telegramUserId')

  return (
    <main>
      {
        telegramUserId ? 
        <>
        <DebugLink />
      <hr />
      <details>
        <summary style={{ fontSize: '1.25rem' }}>State</summary>
        <State />
      </details>
      <details>
        <summary style={{ fontSize: '1.25rem', marginTop: '1rem' }}>
          Events
        </summary>
        <Events />
      </details>
      <hr />
      <Connect />
      <hr />
      <RequestKey />
      <hr />
      <GrantPermissions />
        </>
       : (
        <>
        <p>Try out tg bot</p>
        <a href="https://t.me/tg_7702_bot">https://t.me/tg_7702_bot</a>
        </>
        
      )
      }
      
    </main>
  )
}

function DebugLink() {
  const { address } = useAccount()

  const connectors = useConnectors()
  const disconnect = Hooks.useDisconnect()

  const searchParams = new URLSearchParams({
    pretty: 'true',
    ...(address ? { address } : {}),
  })

  return (
    <div
      style={{
        top: 200,
        right: 0,
        padding: '0px',
        display: 'flex',
        position: 'fixed',
        paddingTop: '5px',
        flexDirection: 'column',
      }}
    >
      <a
        target="_blank"
        rel="noreferrer"
        href={`${SERVER_URL}/debug?${searchParams.toString()}`}
        style={{
          padding: '6px',
          color: 'white',
          width: '100%',
          fontWeight: '700',
          textDecoration: 'none',
          backgroundColor: 'black',
          borderColor: 'darkgray',
          borderWidth: '1px',
          borderStyle: 'solid',
        }}
      >
        DEBUG
      </a>
      <button
        hidden={!import.meta.env.DEV}
        disabled={!import.meta.env.DEV}
        onClick={async () => {
          await nukeEverything()
          await Promise.all(
            connectors.map((c) => disconnect.mutateAsync({ connector: c })),
          )
        }}
        type="button"
        style={{
          padding: '6px',
          color: 'white',
          width: '100%',
          fontWeight: '700',
          textDecoration: 'none',
          backgroundColor: 'black',
          borderColor: 'darkgray',
          borderWidth: '1px',
          borderStyle: 'solid',
        }}
      >
        RESET RECORDS
      </button>
    </div>
  )
}

function Connect() {
  const label = `_exp-tg-bot-${Math.floor(Date.now() / 1_000)}`
  const [grantPermissions, setGrantPermissions] = useState<boolean>(true)

  const connectors = useConnectors()
  const connector = connectors.find((x) => x.id === 'xyz.ithaca.porto')

  const { address } = useAccount()
  const connect = Hooks.useConnect()
  const disconnect = Hooks.useDisconnect()
  const allPermissions_ = Hooks.usePermissions()
  const latestPermissions = allPermissions_.data?.at(-1)

  const disconnectFromAll = async () => {
    await Promise.all(connectors.map((c) => c.disconnect().catch(() => {})))
    await disconnect.mutateAsync({ connector })
  }

  return (
    <div>
      <div
        style={{
          gap: '10px',
          display: 'flex',
          marginBottom: '0px',
          alignItems: 'flex-end',
        }}
      >
        <h3 style={{ marginBottom: '0px' }}>[client] wallet_connect</h3>|
        <p style={{ marginBottom: '0px' }}>{connect.status}</p>
      </div>
      <p>
        <input
          type="checkbox"
          checked={grantPermissions}
          onChange={() => setGrantPermissions((x) => !x)}
        />
        Grant Permissions
      </p>

      {connector && (
        <div key={connector?.uid} style={{ display: 'flex', gap: '10px' }}>
          <button
            key={connector?.uid}
            disabled={connect.status === 'pending'}
            onClick={async () =>
              disconnectFromAll().then(() =>
                connect.mutateAsync({
                  connector,
                  grantPermissions: grantPermissions
                    ? permissions()
                    : undefined,
                }),
              )
            }
            type="button"
          >
            Login
          </button>
          <button
            disabled={connect.status === 'pending'}
            onClick={async () =>
              disconnectFromAll().then(() => {
                nukeEverything()
                connect.mutate({
                  connector,
                  createAccount: { label },
                  grantPermissions: grantPermissions
                    ? permissions()
                    : undefined,
                })
              })
            }
            type="button"
          >
            Register
          </button>
          <button
            type="button"
            onClick={disconnectFromAll}
            disabled={
              connect.status === 'pending' ||
              disconnect.status === 'pending' ||
              !address
            }
          >
            Disconnect
          </button>
        </div>
      )}
      <p>{connect.error?.message}</p>
      {address && <p>Account: {address}</p>}

      {address && latestPermissions && (
        <details
          style={{ marginTop: '5px' }}
          key={latestPermissions.expiry + latestPermissions.id}
        >
          <summary>
            <span style={{ marginRight: '8px' }}>Permissions:</span>
            {truncateHexString({
              address: latestPermissions?.key.publicKey,
              length: 12,
            })}
          </summary>
          <pre>{Json.stringify(latestPermissions, undefined, 2)}</pre>
        </details>
      )}
    </div>
  )
}

interface Key {
  type: 'p256'
  expiry: number
  publicKey: Hex.Hex
  role: 'session' | 'admin'
}

function RequestKey() {
  const { address } = useAccount()

  // const { refetch } = useDebug({ enabled: !!address, address })
  const telegramUserId = new URLSearchParams(window.location.search).get('telegramUserId')

  const requestKeyMutation = useMutation<Key>({
    mutationFn: async () => {
      if (!address) return
      const searchParams = new URLSearchParams({
        expiry: permissions().expiry.toString(),
        telegramUserId: telegramUserId ?? '',
      })
      const response = await fetch(
        `${SERVER_URL}/keys/${address.toLowerCase()}?${searchParams.toString()}`,
      )
      const result = await Json.parse(await response.text())
      await wagmiConfig.storage?.setItem(
        `${address.toLowerCase()}-keys`,
        Json.stringify(result),
      )
      return result
    },
  })
  return (
    <div>
      <h3>[server] Request Key from Server (GET /keys/:address)</h3>
      <button
        type="button"
        onClick={() => requestKeyMutation.mutate()}
        disabled={requestKeyMutation.status === 'pending'}
      >
        {requestKeyMutation.status === 'pending'
          ? 'Requesting key…'
          : 'Request Key'}
      </button>
      {requestKeyMutation.data ? (
        <details>
          <summary style={{ marginTop: '1rem' }}>
            {truncateHexString({
              address: requestKeyMutation.data?.publicKey,
              length: 12,
            })}{' '}
            - expires:{' '}
            {new Date(requestKeyMutation.data.expiry * 1_000).toLocaleString()}{' '}
            (local time)
          </summary>
          <pre>{Json.stringify(requestKeyMutation.data, undefined, 2)}</pre>
        </details>
      ) : null}
    </div>
  )
}

function GrantPermissions() {
  const { address } = useAccount()
  const grantPermissions = Hooks.useGrantPermissions()
  return (
    <div>
      <h3>
        [client] Grant Permissions to Server (experimental_grantPermissions)
      </h3>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (!address) return

          const key = Json.parse(
            (await wagmiConfig.storage?.getItem(
              `${address.toLowerCase()}-keys`,
            )) || '{}',
          ) as Key

          // if `expry` is present in both `key` and `permissions`, pick the lower value
          const expiry = Math.min(key.expiry, permissions().expiry)

          grantPermissions.mutate({
            key,
            expiry,
            address,
            permissions: permissions().permissions,
          })
        }}
      >
        <button
          type="submit"
          style={{ marginBottom: '5px' }}
          disabled={grantPermissions.status === 'pending'}
        >
          {grantPermissions.status === 'pending'
            ? 'Authorizing…'
            : 'Grant Permissions'}
        </button>
        {grantPermissions.status === 'error' && (
          <p>{grantPermissions.error?.message}</p>
        )}
      </form>
      {grantPermissions.data ? (
        <details>
          <summary style={{ marginTop: '1rem' }}>
            Permissions:{' '}
            {truncateHexString({
              address: grantPermissions.data?.key.publicKey,
              length: 12,
            })}
          </summary>
          <pre>{Json.stringify(grantPermissions.data, undefined, 2)}</pre>
        </details>
      ) : null}
    </div>
  )
}

function Mint() {
  const { address } = useAccount()
  const { data: id, error, isPending, sendCalls } = useSendCalls()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useCallsStatus({
    id: id as string,
    query: {
      enabled: !!id,
      refetchInterval: ({ state }) => {
        if (state.data?.status === 'CONFIRMED') return false
        return 1_000
      },
    },
  })

  const balance = useBalance()
  const [transactions, setTransactions] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (id) setTransactions((prev) => new Set([...prev, id]))
  }, [id])

  return (
    <div>
      <h3>[client] Mint EXP [balance: {balance}]</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          sendCalls({
            calls: [
              {
                functionName: 'mint',
                abi: ExperimentERC20.abi,
                to: ExperimentERC20.address[0],
                args: [address!, Value.fromEther('100')],
              },
            ],
          })
        }}
      >
        <button
          type="submit"
          disabled={isPending}
          style={{ marginBottom: '5px' }}
        >
          {isPending ? 'Confirming...' : 'Mint 100 EXP'}
        </button>
      </form>
      <ul style={{ listStyleType: 'none', padding: 0 }}>
        {Array.from(transactions).map((tx) => (
          <li key={tx}>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={`https://odyssey-explorer.ithaca.xyz/tx/${tx}`}
            >
              {tx}
            </a>
          </li>
        ))}
      </ul>
      <p>{isConfirming && 'Waiting for confirmation...'}</p>
      <p>{isConfirmed && 'Transaction confirmed.'}</p>
      {error && (
        <div>
          Error: {(error as Errors.BaseError).shortMessage || error.message}
        </div>
      )}
    </div>
  )
}

const schedules = {
  'once every 10 seconds': '*/10 * * * * *',
  'once every minute': '* * * * *',
  'once every hour': '0 * * * *',
  'once every day': '0 0 * * *',
  'once every week': '0 0 * * 0',
} as const

type Schedule = keyof typeof schedules

function DemoScheduler() {
  const { address } = useAccount()
  const [error, setError] = useState<string | null>(null)
  const { data: debugData } = useDebug({ address, enabled: !!address })

  const scheduleTransactionMutation = useMutation({
    mutationFn: async ({
      count = 6,
      action,
      schedule,
    }: {
      count?: number
      action: string
      schedule: Schedule
    }) => {
      if (!address) return

      const { expiry } = permissions()

      if (expiry < Math.floor(Date.now() / 1_000)) {
        throw new Error('Key expired')
      }

      const searchParams = new URLSearchParams({
        address: address.toLowerCase(),
      })
      const url = `${SERVER_URL}/schedule?${searchParams.toString()}`
      const response = await fetch(url, {
        method: 'POST',
        body: Json.stringify({ action, schedule }),
      })

      return { ...Json.parse(await response.text()), count }
    },
    onSuccess: (data) => {
      console.info('scheduleTransactionMutation onSuccess', data)
      startWorkflowMutation.mutate({ count: data.count })
    },
  })

  const startWorkflowMutation = useMutation({
    mutationFn: async ({ count }: { count: number }) => {
      if (!address) return
      console.info('startWorkflowMutation', count)

      const response = await fetch(
        `${SERVER_URL}/workflow/${address.toLowerCase()}?count=${count}`,
      )
      return Json.parse(await response.text())
    },
  })

  const isPending =
    scheduleTransactionMutation.status === 'pending' ||
    startWorkflowMutation.status === 'pending'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h3>[server] Schedule Transactions</h3>
        <p style={{ marginLeft: '6px' }}>
          | active schedules: {debugData?.schedules?.length || 0} |
        </p>
        {startWorkflowMutation.status !== 'idle' && (
          <span
            style={{
              marginLeft: '10px',
              color:
                startWorkflowMutation.status === 'error'
                  ? '#F43F5E'
                  : '#16A34A',
            }}
          >
            {startWorkflowMutation.status}
          </span>
        )}
      </div>
      <p style={{ fontStyle: 'italic', color: 'lightgray' }}>
        (wallet_prepareCalls {'->'} wallet_sendPreparedCalls)
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()

          const formData = new FormData(event.target as HTMLFormElement)

          const action =
            (formData.get('action') as string) ?? 'approve-transfer'
          const schedule = formData.get('schedule') as Schedule
          const count = Number(formData.get('count') as string) || 6

          const cron = schedules[schedule]
          if (!cron) return setError('Invalid schedule')

          scheduleTransactionMutation.mutate({ action, schedule, count })
        }}
      >
        <p>Approve & Transfer 1 EXP</p>
        <select
          name="schedule"
          style={{ marginRight: '10px' }}
          defaultValue="once every 10 seconds"
        >
          <option value="once every 10 seconds">once every 10 seconds</option>
          <option value="once every minute" disabled>
            once every minute (coming soon)
          </option>
          <option value="once every hour" disabled>
            once every hour (coming soon)
          </option>
          <option value="once every day" disabled>
            once every day (coming soon)
          </option>
        </select>
        <div
          style={{
            margin: '10px 0',
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
          }}
        >
          <span style={{ margin: 'auto 0', fontSize: '' }}>
            Total Transactions
          </span>
          <input
            min={1}
            max={10}
            name="count"
            type="number"
            placeholder="6"
            defaultValue={6}
            style={{ width: '40px', margin: '0 20px' }}
          />

          <button
            type="submit"
            disabled={isPending}
            style={{ width: '75px', textAlign: 'center' }}
          >
            {isPending ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
      {error && (
        <pre style={{ color: '#F43F5E' }}>
          {error}
          <br />
          Try again in a few seconds
        </pre>
      )}
      <ul style={{ paddingLeft: 10 }}>
        {debugData
          ? debugData?.transactions?.toReversed()?.map((transaction) => {
              return (
                <li key={transaction.id} style={{ marginBottom: '8px' }}>
                  <p style={{ margin: 3 }}>
                    🔑 PUBLIC KEY:{' '}
                    {truncateHexString({
                      address: transaction.public_key,
                      length: 6,
                    })}{' '}
                    | TYPE: {transaction.role}
                  </p>
                  <span>🔗 TX HASH: </span>
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`https://odyssey-explorer.ithaca.xyz/tx/${transaction.hash}`}
                  >
                    {truncateHexString({
                      length: 12,
                      address: transaction.hash,
                    })}
                  </a>
                </li>
              )
            })
          : null}
      </ul>
    </div>
  )
}

function State() {
  const state = useSyncExternalStore(
    // @ts-ignore
    porto._internal.store.subscribe,
    // @ts-ignore
    () => porto._internal.store.getState(),
    // @ts-ignore
    () => porto._internal.store.getState(),
  )
  return (
    <div>
      <h3>State</h3>
      {state.accounts.length === 0 ? (
        <p>Disconnected</p>
      ) : (
        <>
          <p>Address: {state.accounts[0].address}</p>
          <p>Chain ID: {state.chain.id}</p>
          <div>
            Keys:{' '}
            <pre>{Json.stringify(state.accounts?.[0]?.keys, null, 2)}</pre>
          </div>
        </>
      )}
    </div>
  )
}

function Events() {
  const [responses, setResponses] = useState<Record<string, unknown>>({})
  useEffect(() => {
    const handleResponse = (event: string) => (response: unknown) =>
      setResponses((responses) => ({
        ...responses,
        [event]: response,
      }))

    const handleAccountsChanged = handleResponse('accountsChanged')
    const handleChainChanged = handleResponse('chainChanged')
    const handleConnect = handleResponse('connect')
    const handleDisconnect = handleResponse('disconnect')
    const handleMessage = handleResponse('message')

    porto.provider.on('accountsChanged', handleAccountsChanged)
    porto.provider.on('chainChanged', handleChainChanged)
    porto.provider.on('connect', handleConnect)
    porto.provider.on('disconnect', handleDisconnect)
    porto.provider.on('message', handleMessage)
    return () => {
      porto.provider.removeListener('accountsChanged', handleAccountsChanged)
      porto.provider.removeListener('chainChanged', handleChainChanged)
      porto.provider.removeListener('connect', handleConnect)
      porto.provider.removeListener('disconnect', handleDisconnect)
      porto.provider.removeListener('message', handleMessage)
    }
  }, [])
  return (
    <div>
      <h3>Events</h3>
      <pre>{Json.stringify(responses, null, 2)}</pre>
    </div>
  )
}
