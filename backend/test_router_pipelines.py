"""
test_router_pipelines.py - Automated Tests for Pipeline A (Configuration) & Pipeline B (Routing)
------------------------------------------------------------------------------------------------
Verifies:
1. Shared registry configuration updates (PATCH)
2. Invalid configuration validation & rejection
3. Persistence of judge changes across registry reloads
4. Test A: Normal request ('HII') selects Liquid LFM2.5 2.6B (lowest latency)
5. Test B: Judge increases Liquid LFM2.5 2.6B avg_latency_ms (550ms -> 5000ms), next request selects NVIDIA Nemotron 3.5 Lightning
6. Test C: Model disabled/unavailable causes router to select next eligible candidate
7. Test D: Impossible constraints returns NO_VALID_MODEL status
8. Test E: Reset defaults restores factory configuration
9. Distinction between live and simulated execution modes
"""

import unittest
import os
import json
from models import ModelRegistry, _DEFAULT_PROFILES
from router import ModelRouter
from constraint_engine import ConstraintEngine


class TestModelRouterPipelines(unittest.TestCase):

    def setUp(self):
        self.test_json = "test_models_config.json"
        if os.path.exists(self.test_json):
            os.remove(self.test_json)
        self.registry = ModelRegistry(persistence_path=self.test_json)
        self.router = ModelRouter()
        self.engine = ConstraintEngine()

    def tearDown(self):
        if os.path.exists(self.test_json):
            os.remove(self.test_json)

    def test_01_registry_defaults(self):
        models = self.registry.get_all()
        self.assertIn("liquid-lfm-2.6b", models)
        self.assertIn("nemotron-3.5-lightning", models)
        self.assertIn("nemotron-3-super", models)
        self.assertIn("north-mini-code", models)
        self.assertIn("gemma-4-26b", models)
        self.assertEqual(models["liquid-lfm-2.6b"].avg_latency_ms, 550)
        self.assertEqual(models["liquid-lfm-2.6b"].max_latency_ms, 1600)

    def test_02_patch_validation_invalid_values(self):
        # Negative latency
        valid, err = self.registry.validate_patch({"avg_latency_ms": -100})
        self.assertFalse(valid)

        # Out-of-bounds capability
        valid, err = self.registry.validate_patch({"capability_score": 15.0})
        self.assertFalse(valid)

        # Arbitrary unknown field
        valid, err = self.registry.validate_patch({"hack_field": "exploit"})
        self.assertFalse(valid)

    def test_03_persistence_of_judge_changes(self):
        # Judge edits Liquid LFM avg latency
        updated, err = self.registry.update("liquid-lfm-2.6b", {"avg_latency_ms": 1900, "enabled": True})
        self.assertIsNone(err)
        self.assertEqual(updated.avg_latency_ms, 1900)

        # Create new registry pointing to same json file (simulating backend restart)
        reloaded_registry = ModelRegistry(persistence_path=self.test_json)
        reloaded_model = reloaded_registry.get("liquid-lfm-2.6b")
        self.assertIsNotNone(reloaded_model)
        self.assertEqual(reloaded_model.avg_latency_ms, 1900)

    def test_04_test_a_normal_request(self):
        """
        TEST A:
        Prompt: 'HII'
        Constraints: max_latency_ms=4000, min_capability_score=3, preference='lowest_latency'
        Expectation: Liquid LFM2.5 2.6B is selected (lowest latency: 550ms).
        """
        models = self.registry.get_all()
        decision = self.router.route(
            prompt="HII",
            constraints={
                "max_latency_ms": 4000,
                "min_capability_score": 3,
                "required_context_length": 1000,
                "preference": "lowest_latency",
            },
            models=models,
        )
        self.assertEqual(decision["status"], "SUCCESS")
        self.assertEqual(decision["selected"], "liquid-lfm-2.6b")

    def test_05_test_b_judge_increases_latency(self):
        """
        TEST B:
        Judge increases Liquid LFM2.5 2.6B configured avg_latency_ms from 550 to 5000.
        Next request with budget=4000ms:
        Expectation: Liquid LFM2.5 2.6B is ranked behind or eliminated, NVIDIA Nemotron 3.5 Lightning is selected!
        """
        self.registry.update("liquid-lfm-2.6b", {"avg_latency_ms": 5000})
        models = self.registry.get_all()

        decision = self.router.route(
            prompt="HII",
            constraints={
                "max_latency_ms": 4000,
                "min_capability_score": 3,
                "required_context_length": 1000,
                "preference": "lowest_latency",
            },
            models=models,
        )
        self.assertEqual(decision["status"], "SUCCESS")
        self.assertEqual(decision["selected"], "nemotron-3.5-lightning")

    def test_06_test_c_model_disabled(self):
        """
        TEST C:
        Judge disables Liquid LFM2.5 2.6B.
        Expectation: Liquid LFM2.5 2.6B rejected as disabled, NVIDIA Nemotron 3.5 Lightning selected.
        """
        self.registry.update("liquid-lfm-2.6b", {"enabled": False})
        models = self.registry.get_all()

        decision = self.router.route(
            prompt="HII",
            constraints={
                "max_latency_ms": 4000,
                "min_capability_score": 3,
                "preference": "lowest_latency",
            },
            models=models,
        )
        self.assertEqual(decision["status"], "SUCCESS")
        self.assertEqual(decision["selected"], "nemotron-3.5-lightning")

    def test_07_test_d_impossible_constraints(self):
        """
        TEST D:
        Impossible SLA (max_latency=100ms, min_capability=10).
        Expectation: NO_VALID_MODEL status returned without forcing invalid model.
        """
        models = self.registry.get_all()
        decision = self.router.route(
            prompt="Complex task",
            constraints={
                "max_latency_ms": 100,
                "min_capability_score": 10.0,
            },
            models=models,
        )
        self.assertEqual(decision["status"], "NO_VALID_MODEL")
        self.assertIsNone(decision["selected"])

    def test_08_test_e_reset_defaults(self):
        """
        TEST E:
        Judge clicks Reset Defaults -> Restores canonical state.
        """
        self.registry.update("liquid-lfm-2.6b", {"avg_latency_ms": 8888, "enabled": False})
        self.registry.reset()
        liquid = self.registry.get("liquid-lfm-2.6b")
        self.assertEqual(liquid.avg_latency_ms, 550)
        self.assertTrue(liquid.enabled)

    def test_09_coding_prompt_routes_to_north_mini_code(self):
        """
        Verify that a coding question like 'give me the code for prime numbers'
        dynamically routes to Cohere North Mini Code.
        """
        models = self.registry.get_all()
        decision = self.router.route(
            prompt="give m the code for prime number between 1 to 10",
            constraints={},
            models=models,
        )
        self.assertEqual(decision["status"], "SUCCESS")
        self.assertEqual(decision["selected"], "north-mini-code")
        self.assertEqual(decision["complexity"]["label"], "CODING")

    def test_10_reasoning_prompt_routes_to_nemotron_super(self):
        """
        Verify that mathematical proof questions route to NVIDIA Nemotron 3 Super.
        """
        models = self.registry.get_all()
        decision = self.router.route(
            prompt="Prove Dijkstra algorithm correctness with mathematical induction",
            constraints={},
            models=models,
        )
        self.assertEqual(decision["status"], "SUCCESS")
        self.assertEqual(decision["selected"], "nemotron-3-super")

    def test_11_multimodal_prompt_routes_to_gemma(self):
        """
        Verify that multimodal visual document / OCR questions route to Google Gemma 4 26B A4B.
        """
        models = self.registry.get_all()
        decision = self.router.route(
            prompt="Parse this document chart diagram and extract table OCR",
            constraints={},
            models=models,
        )
        self.assertEqual(decision["status"], "SUCCESS")
        self.assertEqual(decision["selected"], "gemma-4-26b")


    def test_12_dynamic_latency_shift_on_same_question(self):
        """
        Verify that changing a model's configured latency causes the EXACT SAME
        simple question to dynamically switch to the model that now has lower latency.
        """
        prompt = "What is 2+2? Answer in one word."
        
        # 1. Initial State: Liquid LFM2.5 2.6B has lowest latency (550ms)
        models = self.registry.get_all()
        decision1 = self.router.route(prompt=prompt, constraints={}, models=models)
        self.assertEqual(decision1["status"], "SUCCESS")
        self.assertEqual(decision1["selected"], "liquid-lfm-2.6b")
        self.assertEqual(decision1["complexity"]["label"], "SIMPLE")

        # 2. Judge increases Liquid LFM2.5 2.6B latency from 550ms to 3000ms
        self.registry.update("liquid-lfm-2.6b", {"avg_latency_ms": 3000})
        models_after_edit = self.registry.get_all()

        # 3. Ask the EXACT SAME question again with empty constraints
        decision2 = self.router.route(prompt=prompt, constraints={}, models=models_after_edit)
        self.assertEqual(decision2["status"], "SUCCESS")
        # NVIDIA Nemotron 3.5 Lightning has 1150ms < 3000ms, so it MUST be chosen!
        self.assertEqual(decision2["selected"], "nemotron-3.5-lightning")

        # 4. Judge increases NVIDIA Nemotron 3.5 Lightning latency to 4000ms
        self.registry.update("nemotron-3.5-lightning", {"avg_latency_ms": 4000})
        models_after_second_edit = self.registry.get_all()

        # 5. Ask the EXACT SAME question again
        decision3 = self.router.route(prompt=prompt, constraints={}, models=models_after_second_edit)
        self.assertEqual(decision3["status"], "SUCCESS")
        # Cohere North Mini Code has 1650ms < 3000ms < 4000ms, so it MUST be chosen!
        self.assertEqual(decision3["selected"], "north-mini-code")


if __name__ == "__main__":
    unittest.main()

