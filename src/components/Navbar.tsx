import { ModeToggle } from './mode-toggle'

const Navbar = () => {
  return (
    <div className="flex justify-between items-center p-4">
        <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Editon</h1>
        </div>
        <div className="flex items-center gap-2">
            <ModeToggle />
        </div>
    </div>
  )
}

export default Navbar