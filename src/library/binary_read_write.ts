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

    getString(val: number) {
        // TODO
    }

    getVec2(): [number, number] {
        return [this.getFloat32(), this.getFloat32()];
    }

    getVec3(): [number, number, number] {
        return [this.getFloat32(), this.getFloat32(), this.getFloat32()];
    }

    getVec4(): [number, number, number, number] {
        return [this.getFloat32(), this.getFloat32(), this.getFloat32(), this.getFloat32()];
    }
}

export class BinaryWriter {
    private view: DataView;
    private offset = 0;

    constructor(target: ArrayBuffer | Uint8Array) {
        if (target instanceof Uint8Array) {
            this.view = new DataView(target.buffer, target.byteOffset, target.byteLength);
        } else {
            this.view = new DataView(target);
        }
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

    setVec2(val: [number, number]) {
        this.setFloat32(val[0]);
        this.setFloat32(val[1]);
    }

    setVec3(val: [number, number, number]) {
        this.setFloat32(val[0]);
        this.setFloat32(val[1]);
        this.setFloat32(val[2]);
    }

    setVec4(val: [number, number, number, number]) {
        this.setFloat32(val[0]);
        this.setFloat32(val[1]);
        this.setFloat32(val[2]);
        this.setFloat32(val[3]);
    }
}