// Wrapper for DataView 
// GLYF files are little-endian

export class BinaryReader {
    private view: DataView;
    private offset = 0;

    constructor(buffer: ArrayBuffer) {
        this.view = new DataView(buffer);
    }

    getFloat32(): number {
        const val = this.view.getFloat32(this.offset, true);
        this.offset += 4;
        return val;
    }

    getUint32(): number {
        const val = this.view.getUint32(this.offset, true);
        this.offset += 4;
        return val;
    }

    getUint16(): number {
        const val = this.view.getUint16(this.offset, true);
        this.offset += 2;
        return val;
    }
}