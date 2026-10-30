import { afterEach, describe, expect, it } from "vitest";
import { DocumentController, type DocumentType } from "../../src/SynCloudOS/Documents";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType, type NoteDocumentModel } from "../fixtures/noteDocumentType";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

describe("initial document admission", () => {
  it.each(["supplied", "factory", "projection"] as const)("rejects an invalid %s model before publication or retained history", async mode => {
    const dependencies = createDocumentTestDependencies();
    cleanups.push(dependencies.cleanup);
    const controller = new DocumentController(dependencies);
    const type: DocumentType<NoteDocumentModel> = {
      ...noteType, create: () => ({ title: "Invalid", body: "invalid" }),
      validate: (value): value is NoteDocumentModel => noteType.validate(value) && value.body !== "invalid",
    };
    controller.registerType(type);
    const before = dependencies.undo.inspect();
    const request = { documentId: "candidate", typeId: type.id, initialModel: { title: "Invalid", body: "invalid" } };
    const opening = mode === "projection" ? controller.newProjectionDocument(request)
      : controller.newDocument(mode === "factory" ? { documentId: request.documentId, typeId: type.id } : request);
    await expect(opening).rejects.toMatchObject({ code: "document-schema" });
    expect(controller.openDocuments).toEqual([]);
    expect(dependencies.undo.inspect()).toEqual(before);
    const valid = await controller.newDocument({ ...request, initialModel: { title: "Valid", body: "ready" } });
    expect(valid.model).toEqual({ title: "Valid", body: "ready" });
  });

  it.each(["writer", "validator"] as const)("refuses and observes an asynchronous initial %s", async callback => {
    const dependencies = createDocumentTestDependencies();
    cleanups.push(dependencies.cleanup);
    const controller = new DocumentController(dependencies);
    const type = { ...noteType,
      ...(callback === "writer" ? { write: () => Promise.reject(new Error("late writer")) }
        : { validate: () => Promise.reject(new Error("late validator")) }),
    } as unknown as DocumentType<NoteDocumentModel>;
    controller.registerType(type);
    await expect(controller.newDocument({ typeId: type.id })).rejects.toMatchObject({ code: "document-schema" });
    await Promise.resolve();
    expect(controller.openDocuments).toEqual([]);
    expect(dependencies.undo.inspect()).toEqual([]);
  });
});
