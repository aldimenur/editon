import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function VideoPage() {
  const [assets, setAssets] = useState([]);
  const [input, setInput] = useState("");

  // Fungsi ambil data
  async function loadData() {
    const data: any = await invoke("get_assets");

    console.log(data)
    setAssets(data);
  }

  // Fungsi tambah data
  async function handleSubmit(e: any) {
    e.preventDefault();
    await invoke("add_asset", { name: input });
    setInput("");
    loadData(); // Refresh list
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button>Simpan</button>
      </form>
      
      <ul>
        {assets.map((item: any) => (
          <li key={item.path}>{item.name}</li>
        ))}
      </ul>
    </div>
  );
}