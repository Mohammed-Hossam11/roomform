import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; onRecover?: () => void }
type State = { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Roomform could not display this view', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <div className="app-error" role="alert">
      <h1>Roomform couldn’t open this view</h1>
      <p>Your saved rooms are still in this browser. Please reload and try again.</p>
      <div className="app-error-actions">
        {this.props.onRecover && <button onClick={() => { this.setState({ failed: false }); this.props.onRecover?.() }}>Back to 2D</button>}
        <button onClick={() => window.location.reload()}>Reload Roomform</button>
      </div>
    </div>
  }
}
