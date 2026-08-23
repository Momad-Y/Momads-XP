
(() => {

	const log = (...args) => {
		window.console && console.log(...args);
	};

	let localStorageAvailable = false;
	try {
		localStorage._available = true;
		localStorageAvailable = localStorage._available;
		delete localStorage._available;
		// eslint-disable-next-line no-empty
	} catch (e) { }

	// @TODO: keep other data in addition to the image data
	// such as the file_name and other state
	// (maybe even whether it's considered saved? idk about that)
	// I could have the image in one storage slot and the state in another

	const match_threshold = 1; // 1 is just enough for a workaround for Brave browser's farbling: https://github.com/1j01/jspaint/issues/184
	const canvas_has_any_apparent_image_data = () =>
		main_canvas.ctx.getImageData(0, 0, main_canvas.width, main_canvas.height).data.some((v) => v > match_threshold);

	let $recovery_window;
	function show_recovery_window(no_longer_blank) {
		$recovery_window && $recovery_window.close();
		const $w = $recovery_window = $DialogWindow();
		$w.on("close", () => {
			$recovery_window = null;
		});
		$w.title("Recover Document");
		let backup_impossible = false;
		try { window.localStorage } catch (e) { backup_impossible = true; }
		$w.$main.append($(`
			<h1>Woah!</h1>
			<p>Your browser may have cleared the canvas due to memory usage.</p>
			<p>Undo to recover the document, and remember to save with <b>File > Save</b>!</p>
			${backup_impossible ?
				"<p><b>Note:</b> No automatic backup is possible unless you enable Cookies in your browser.</p>"
				: (
					no_longer_blank ?
						`<p>
							<b>Note:</b> normally a backup is saved automatically,<br>
							but autosave is paused while this dialog is open<br>
							to avoid overwriting the (singular) backup.
						</p>
						<p>
							(See <b>File &gt; Manage Storage</b> to view backups.)
						</p>`
						: ""
				)
			}
		`));

		const $undo = $w.$Button("Undo", () => {
			undo();
		});
		const $redo = $w.$Button("Redo", () => {
			redo();
		});
		const update_buttons_disabled = () => {
			$undo.attr("disabled", undos.length < 1);
			$redo.attr("disabled", redos.length < 1);
		};
		$G.on("session-update.session-hook", update_buttons_disabled);
		update_buttons_disabled();

		$w.$Button(localize("Close"), () => {
			$w.close();
		});
		$w.center();

		$w.find("button:enabled").focus();
	}

	let last_undos_length = undos.length;
	function handle_data_loss() {
		const window_is_open = $recovery_window && !$recovery_window.closed;
		let save_paused = false;
		if (!canvas_has_any_apparent_image_data()) {
			if (!window_is_open) {
				show_recovery_window();
			}
			save_paused = true;
		} else if (window_is_open) {
			if (undos.length > last_undos_length) {
				show_recovery_window(true);
			}
			save_paused = true;
		}
		last_undos_length = undos.length;
		return save_paused;
	}

	class LocalSession {
		constructor(session_id) {
			this.id = session_id;
			const lsid = `image#${session_id}`;
			log(`Local storage ID: ${lsid}`);
			// save image to storage
			this.save_image_to_storage_immediately = () => {
				const save_paused = handle_data_loss();
				if (save_paused) {
					return;
				}
				log(`Saving image to storage: ${lsid}`);
				storage.set(lsid, main_canvas.toDataURL("image/png"), err => {
					if (err) {
						if (err.quotaExceeded) {
							storage_quota_exceeded();
						}
						else {
							// e.g. localStorage is disabled
							// (or there's some other error?)
							// @TODO: show warning with "Don't tell me again" type option
						}
					}
				});
			};
			this.save_image_to_storage_soon = debounce(this.save_image_to_storage_immediately, 100);
			storage.get(lsid, (err, uri) => {
				if (err) {
					if (localStorageAvailable) {
						show_error_message("Failed to retrieve image from local storage.", err);
					}
					else {
						// @TODO: DRY with storage manager message
						showMessageBox({
							message: "Please enable local storage in your browser's settings for local backup. It may be called Cookies, Storage, or Site Data.",
						});
					}
				}
				else if (uri) {
					load_image_from_uri(uri).then((info) => {
						open_from_image_info(info, null, null, true, true);
					}, (error) => {
						show_error_message("Failed to open image from local storage.", error);
					});
				}
				else {
					// no uri so lets save the blank canvas
					this.save_image_to_storage_soon();
				}
			});
			$G.on("session-update.session-hook", this.save_image_to_storage_soon);
		}
		end() {
			// Skip debounce and save immediately
			this.save_image_to_storage_soon.cancel();
			this.save_image_to_storage_immediately();
			// Remove session-related hooks
			$G.off(".session-hook");
		}
	}


	// The user ID is not persistent
	// A person can enter a session multiple times,
	// and is always given a new user ID
	let user_id;
	// @TODO: I could make the color persistent, though.
	// You could still have multiple cursors and they would just be the same color.
	// There could also be an option to change your color

	// The data in this object is stored in the server when you enter a session
	// It is (supposed to be) removed when you leave
	const user = {
		// Cursor status
		cursor: {
			// cursor position in canvas coordinates
			x: 0, y: 0,
			// whether the user is elsewhere, such as in another tab
			away: true,
		},
		// Currently selected tool (@TODO)
		tool: localize("Pencil"),
		// Color components
		hue: ~~(Math.random() * 360),
		saturation: ~~(Math.random() * 50) + 50,
		lightness: ~~(Math.random() * 40) + 50,
	};

	// The main cursor color
	user.color = `hsla(${user.hue}, ${user.saturation}%, ${user.lightness}%, 1)`;
	// Unused
	user.color_transparent = `hsla(${user.hue}, ${user.saturation}%, ${user.lightness}%, 0.5)`;
	// (@TODO) The color (that may be) used in the toolbar indicating to other users it is selected by this user
	user.color_desaturated = `hsla(${user.hue}, ${~~(user.saturation * 0.4)}%, ${user.lightness}%, 0.8)`;


	// The image used for other people's cursors
	const cursor_image = new Image();
	cursor_image.src = "images/cursors/default.png";





	// Handle the starting, switching, and ending of sessions from the location.hash

	let current_session;
	const end_current_session = () => {
		if (current_session) {
			log("Ending current session");
			current_session.end();
			current_session = null;
		}
	};
	const generate_session_id = () => (Math.random() * (2 ** 32)).toString(16).replace(".", "");
	const update_session_from_location_hash = () => {
		const session_match = location.hash.match(/^#?(?:.*,)?(local):(.*)$/i);
		if (session_match) {
			const local = session_match[1].toLowerCase() === "local";
			const session_id = session_match[2];
			if (session_id === "") {
				log("Invalid session ID; session ID cannot be empty");
				end_current_session();
			} else if (!local && session_id.match(/[./[\]#$]/)) {
				log("Session ID is not a valid Firebase location; it cannot contain any of ./[]#$");
				end_current_session();
			} else if (!session_id.match(/[-0-9A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02af\u1d00-\u1d25\u1d62-\u1d65\u1d6b-\u1d77\u1d79-\u1d9a\u1e00-\u1eff\u2090-\u2094\u2184-\u2184\u2488-\u2490\u271d-\u271d\u2c60-\u2c7c\u2c7e-\u2c7f\ua722-\ua76f\ua771-\ua787\ua78b-\ua78c\ua7fb-\ua7ff\ufb00-\ufb06]+/)) {
				log("Invalid session ID; it must consist of 'alphanumeric-esque' characters");
				end_current_session();
			} else if (
				current_session && current_session.id === session_id &&
				local === (current_session instanceof LocalSession)
			) {
				log("Hash changed but the session ID and session type are the same");
			} else {
				// @TODO: Ask if you want to save before starting a new session
				end_current_session();
				log(`Starting a new LocalSession, ID: ${session_id}`);
				current_session = new LocalSession(session_id);
			}
		} else {
			log("No session ID in hash");
			const old_hash = location.hash;
			end_current_session();
			change_url_param("local", generate_session_id(), { replace_history_state: true });
			log("After replaceState:", location.hash);
			if (old_hash === location.hash) {
				// e.g. on Wayback Machine
				show_error_message("Autosave is disabled. Failed to update URL to start session.");
			} else {
				update_session_from_location_hash();
			}
		}
	};

	$G.on("hashchange popstate change-url-params", e => {
		log(e.type, location.hash);
		update_session_from_location_hash();
	});
	log("Initializing with location hash:", location.hash);
	update_session_from_location_hash();

	window.new_local_session = () => {
		end_current_session();
		log("Changing URL to start new session...");
		change_url_param("local", generate_session_id());
	};

	// @TODO: Session GUI
	// @TODO: Indicate when the session ID is invalid
	// @TODO: Indicate when the session switches

	// @TODO: Indicate when there is no session!
	// Probably in app.js so as to handle the possibility of sessions.js failing to load.
})();
