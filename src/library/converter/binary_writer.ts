// Wrapper for DataView
// GLYF files are little-endian

export class BinaryWriter {
    private view: DataView;
    private offset = 0;

    constructor(buffer: ArrayBuffer) {
        this.view = new DataView(buffer);
    }

    setFloat32(val: number) {
        this.view.setFloat32(this.offset, val, true);
        this.offset += 4;
    }

    setUint32(val: number) {
        this.view.setUint32(this.offset, val, true);
        this.offset += 4;
    }

    setUint16(val: number) {
        this.view.setUint16(this.offset, val, true);
        this.offset += 2;
    }
}