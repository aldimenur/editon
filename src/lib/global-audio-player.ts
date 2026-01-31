import WaveSurfer from "wavesurfer.js";

class GlobalAudioPlayer {
  private currentPlayer: WaveSurfer | null = null;

  play(wavesurfer: WaveSurfer) {
    if (this.currentPlayer && this.currentPlayer !== wavesurfer) {
      this.currentPlayer.pause();
    }
    this.currentPlayer = wavesurfer;
  }

  stop() {
    if (this.currentPlayer) {
      this.currentPlayer.pause();
      this.currentPlayer = null;
    }
  }
}

export const globalAudioPlayer = new GlobalAudioPlayer();
