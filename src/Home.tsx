import { useState } from 'react'
import { ArrowRight, Compass, Copy, Ellipsis, House, Pencil, Plus, Trash2 } from 'lucide-react'
import { RoomThumb } from './Rooms'
import { type Project } from './model'

type Props = {
  rooms: Project[]; activeId: string; onContinue: () => void; onCreate: () => void
  onOpen: (id: string) => void; onRename: (id: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onTour: () => void
}
const edited = (room: Project) => new Date(room.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function Home({ rooms, activeId, onContinue, onCreate, onOpen, onRename, onDuplicate, onDelete, onTour }: Props) {
  const [menu, setMenu] = useState<string | null>(null)
  const recent = [...rooms].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id
  return <div className="home-page">
    <header className="home-nav"><button className="home-wordmark" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Roomform home"><span className="home-mark"><House size={19}/></span>roomform<span>.</span></button><div className="home-nav-end"><span>Interior design studio</span><button className="home-tour" onClick={onTour}><Compass size={16}/> Take the Tour</button></div></header>
    <main className="home-main">
      <div className="home-hero"><div><span className="home-kicker">YOUR DESIGN STUDIO</span><h1>Welcome to Roomform</h1><p>Your spaces, your ideas, beautifully designed.</p></div><div className="home-hero-actions"><button className="home-create" onClick={onCreate}><Plus size={18}/> Create New Room</button>{rooms.length > 0 && <button className="home-continue" onClick={onContinue}>Continue Designing <ArrowRight size={17}/></button>}</div></div>
      {rooms.length ? <section className="home-spaces" aria-label="My Spaces"><div className="home-section-head"><div><span className="home-kicker">YOUR COLLECTION</span><h2>My Spaces</h2></div><span>{rooms.length} room{rooms.length === 1 ? '' : 's'}</span></div>
        <div className="home-grid">{[...rooms].sort((a, b) => b.updatedAt - a.updatedAt).map(room => <article className={`home-card ${room.id === activeId ? 'home-active' : ''}`} key={room.id}>
          <button className="home-thumb-button" onClick={() => onOpen(room.id)} aria-label={`Open ${room.name}`}><RoomThumb room={room}/></button>
          <div className="home-card-body"><div className="home-card-title"><div>{room.id === recent && <span className="home-recent">Recently edited</span>}<h3>{room.name}</h3></div><div className="home-card-menu"><button aria-label={`Actions for ${room.name}`} aria-expanded={menu === room.id} onClick={() => setMenu(menu === room.id ? null : room.id)}><Ellipsis size={19}/></button>{menu === room.id && <div className="home-card-actions"><button onClick={() => {setMenu(null);onRename(room.id)}}><Pencil size={15}/> Rename</button><button onClick={() => {setMenu(null);onDuplicate(room.id)}}><Copy size={15}/> Duplicate</button><button onClick={() => {setMenu(null);onDelete(room.id)}} disabled={rooms.length <= 1}><Trash2 size={15}/> Delete</button></div>}</div></div>
            <p>{room.room.width} × {room.room.depth} cm <span>·</span> {room.layouts.length} saved design{room.layouts.length === 1 ? '' : 's'}</p><small>Edited {edited(room)}</small><button className="home-open" onClick={() => onOpen(room.id)}>Open Room <ArrowRight size={16}/></button>
          </div>
        </article>)}</div>
        <p className="home-storage-note">Rooms are saved in this browser. Export your project as JSON to move it to another device.</p>
      </section> : <section className="home-empty"><div className="home-empty-icon"><House size={31}/></div><h2>Your next space starts here.</h2><p>Create your first room and bring your ideas to life.</p><button className="home-create" onClick={onCreate}><Plus size={18}/> Create Your First Room</button></section>}
    </main>
    <footer className="home-footer">roomform. <span>Design your space, your way.</span></footer>
    {menu && <button className="home-menu-dismiss" aria-label="Close actions" onClick={() => setMenu(null)}/>}
  </div>
}

