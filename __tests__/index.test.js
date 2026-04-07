import { afterAll, describe, expect, it } from '@jest/globals';
const { default: request } = await import('supertest');
const { app, server } = await import('../src/index.js');

describe('🚀 API Tasks - Tests Approfondis', () => {

    afterAll((done) => {
        if (server) {
            server.close(done);
        } else {
            done();
        }
    });

    describe('GET /tasks', () => {
        it("✅ Récupérer toutes les tâches avec succès", async () => {
            const res = await request(app).get('/tasks');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body[0].title).toBe('Mock Task');
        });

        it("✅ Retourner tous les champs dans la liste", async () => {
            const res = await request(app).get('/tasks');
            expect(res.status).toBe(200);
            expect(res.body[0]).toHaveProperty('dueDate');
            expect(res.body[0]).toHaveProperty('color');
            expect(res.body[0]).toHaveProperty('description');
            expect(res.body[0]).toHaveProperty('updatedAt');
        });
    });

    describe('POST /tasks', () => {
        it("✅ Créer une tâche avec génération d'ID", async () => {
            const res = await request(app)
                .post('/tasks')
                .send({ title: 'Apprendre Jest' });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.completed).toBe(false);
            expect(res.body).toHaveProperty('dueDate');
            expect(res.body).toHaveProperty('color');
        });

        it("❌ Rejeter une tâche sans title", async () => {
            const res = await request(app)
                .post('/tasks')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Title is required and must be a string');
        });

        it("❌ Rejeter un title trop long", async () => {
            const res = await request(app)
                .post('/tasks')
                .send({ title: 'a'.repeat(501) });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Title must be between 1 and 500 characters');
        });

        it("✅ Créer une tâche avec description", async () => {
            const res = await request(app)
              .post('/tasks')
              .send({ title: 'Tâche avec desc', description: 'Une description utile' });

            expect(res.status).toBe(201);
            expect(res.body.description).toBe('Une description utile');
            expect(res.body).toHaveProperty('updatedAt');
        });

        it("❌ Rejeter une description trop longue", async () => {
            const res = await request(app)
              .post('/tasks')
              .send({ title: 'T', description: 'a'.repeat(2001) });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('description must be 2000 characters or less');
        });

        it("✅ Créer une tâche avec dueDate et color valides", async () => {
            const res = await request(app)
                .post('/tasks')
                .send({ title: 'Tâche avec date', dueDate: '2026-12-31T00:00:00.000Z', color: '#FF5733' });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('dueDate');
            expect(res.body).toHaveProperty('color');
        });

        it("❌ Rejeter un dueDate invalide", async () => {
            const res = await request(app)
                .post('/tasks')
                .send({ title: 'T', dueDate: 'not-a-date' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('dueDate must be a valid ISO 8601 date string');
        });

        it("❌ Rejeter une color invalide (mot)", async () => {
            const res = await request(app)
                .post('/tasks')
                .send({ title: 'T', color: 'red' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('color must be a valid hex color string (e.g. #FF5733)');
        });

        it("❌ Rejeter une color sans #", async () => {
            const res = await request(app)
                .post('/tasks')
                .send({ title: 'T', color: 'FF5733' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('color must be a valid hex color string (e.g. #FF5733)');
        });
    });

    describe('PATCH /tasks/:id', () => {
        it("✅ Modifier partiellement une tâche", async () => {
            const res = await request(app)
                .patch('/tasks/1')
                .send({ completed: true });

            expect(res.status).toBe(200);
            expect(res.body.completed).toBe(true);
        });

        it("❌ Retourner 404 si la tâche n'existe pas", async () => {
            const res = await request(app)
                .patch('/tasks/999')
                .send({ title: 'New' });
            expect(res.status).toBe(404);
        });

        it("✅ Modifier la description", async () => {
            const res = await request(app)
              .patch('/tasks/1')
              .send({ description: 'Nouvelle description' });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('updatedAt');
        });

        it("✅ Effacer la description en envoyant null", async () => {
            const res = await request(app)
              .patch('/tasks/1')
              .send({ description: null });

            expect(res.status).toBe(200);
            expect(res.body.description).toBeNull();
        });

        it("✅ Modifier dueDate et color", async () => {
            const res = await request(app)
                .patch('/tasks/1')
                .send({ dueDate: '2026-06-01T00:00:00.000Z', color: '#AABBCC' });

            expect(res.status).toBe(200);
        });

        it("✅ Effacer dueDate en envoyant null", async () => {
            const res = await request(app)
                .patch('/tasks/1')
                .send({ dueDate: null });

            expect(res.status).toBe(200);
        });
    });

    describe('DELETE /tasks/:id', () => {
        it("✅ Supprimer une tâche existante", async () => {
            const res = await request(app).delete('/tasks/1');
            expect(res.status).toBe(204);
        });
    });
});
